/**
 * Browser-only garment photo compression. Every export touches DOM APIs
 * (canvas, createImageBitmap, FileReader), so call them only from event
 * handlers or effects in client components, never during render or on the
 * server.
 */

export interface CompressGarmentOptions {
  /** Longest edge in pixels. Defaults to 800. */
  maxDimension?: number;
  /** Initial encoder quality between 0 and 1. Defaults to 0.82. */
  quality?: number;
  /** Size the encoder steps down toward. Defaults to 150 KB. */
  targetBytes?: number;
}

export interface CompressedGarmentImage {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  /** Average color of the garment, ignoring near-white studio backgrounds. */
  dominantHex: string | null;
}

export class ImageCompressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageCompressionError";
  }
}

const DEFAULT_MAX_DIMENSION = 800;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_TARGET_BYTES = 150 * 1024;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;
// Fallback steps tried, in order, until the output fits the target size.
const QUALITY_STEPS = [0.72, 0.62];
const DIMENSION_STEPS = [640, 512];

function assertBrowser(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new ImageCompressionError("Image compression is only available in the browser.");
  }
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  // createImageBitmap applies EXIF orientation, which matters for phone photos.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall through to <img>, which some browsers decode more permissively.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new ImageCompressionError("This photo could not be read. Use a JPG, PNG, or WebP image.");
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function drawScaled(image: DecodedImage, maxDimension: number, opaqueBackground: boolean): HTMLCanvasElement {
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageCompressionError("This browser cannot process images.");

  if (opaqueBackground) {
    // JPEG has no alpha channel; transparent pixels would otherwise turn black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image.source, 0, 0, width, height);
  return canvas;
}

async function encode(
  image: DecodedImage,
  maxDimension: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const webpCanvas = drawScaled(image, maxDimension, false);
  const webp = await canvasToBlob(webpCanvas, "image/webp", quality);
  // Browsers without a WebP encoder silently return PNG instead.
  if (webp && webp.type === "image/webp") {
    return { blob: webp, width: webpCanvas.width, height: webpCanvas.height };
  }

  const jpegCanvas = drawScaled(image, maxDimension, true);
  const jpeg = await canvasToBlob(jpegCanvas, "image/jpeg", quality);
  if (!jpeg) throw new ImageCompressionError("This photo could not be compressed.");
  return { blob: jpeg, width: jpegCanvas.width, height: jpegCanvas.height };
}

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/**
 * Averages a 24px thumbnail, skipping transparent and near-white pixels so a
 * studio background does not wash out the garment color.
 */
function estimateDominantHex(image: DecodedImage): string | null {
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image.source, 0, 0, size, size);

  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }

  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    const [r, g, b] = [pixels[index], pixels[index + 1], pixels[index + 2]];
    if (alpha < 128 || (r > 235 && g > 235 && b > 235)) continue;
    red += r;
    green += g;
    blue += b;
    count += 1;
  }

  if (count < size) return null;
  return toHex(red / count, green / count, blue / count);
}

export async function compressGarmentImage(
  file: File | Blob,
  opts: CompressGarmentOptions = {},
): Promise<CompressedGarmentImage> {
  assertBrowser();
  if (file.type && !file.type.startsWith("image/")) {
    throw new ImageCompressionError("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageCompressionError("Choose a photo under 30 MB.");
  }

  const maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const targetBytes = opts.targetBytes ?? DEFAULT_TARGET_BYTES;
  const image = await decodeImage(file);

  try {
    if (image.width < 1 || image.height < 1) {
      throw new ImageCompressionError("This photo is empty.");
    }

    // Try lower quality first, then smaller dimensions, and stop at the first fit.
    const attempts: [number, number][] = [
      [maxDimension, quality],
      ...QUALITY_STEPS.filter((step) => step < quality).map((step): [number, number] => [maxDimension, step]),
      ...DIMENSION_STEPS.filter((step) => step < maxDimension).map((step): [number, number] => [step, Math.min(quality, QUALITY_STEPS.at(-1) ?? quality)]),
    ];

    let best = await encode(image, attempts[0][0], attempts[0][1]);
    for (const [dimension, stepQuality] of attempts.slice(1)) {
      if (best.blob.size <= targetBytes) break;
      const candidate = await encode(image, dimension, stepQuality);
      if (candidate.blob.size < best.blob.size) best = candidate;
    }

    return {
      blob: best.blob,
      width: best.width,
      height: best.height,
      mimeType: best.blob.type,
      sizeBytes: best.blob.size,
      dominantHex: estimateDominantHex(image),
    };
  } finally {
    image.release();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  assertBrowser();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new ImageCompressionError("The image could not be encoded."));
    };
    reader.onerror = () => reject(new ImageCompressionError("The image could not be encoded."));
    reader.readAsDataURL(blob);
  });
}

const DATA_URL_PATTERN = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,([\s\S]*)$/;

/** Decodes both base64 and percent-encoded (for example SVG) data URLs. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw new ImageCompressionError("That is not a valid data URL.");

  const [, mimeType, , base64Flag, payload] = match;
  const type = mimeType || "application/octet-stream";

  if (base64Flag) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type });
  }

  return new Blob([decodeURIComponent(payload)], { type });
}
