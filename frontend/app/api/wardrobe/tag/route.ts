import {
  LlmError,
  requestStructuredCompletion,
  resolveLlmProvider,
} from "@/lib/ai/llm";
import { jsonError, readJsonBody, RequestBodyError } from "@/lib/http/json-body";
import {
  CLOSET_FITS,
  CLOSET_FORMALITIES,
  CLOSET_SEASONS,
  GARMENT_CATEGORIES,
  GARMENT_COLOR_PALETTE,
  sanitizeGarmentTags,
} from "@/lib/wardrobe/garment-tags";
import { inferGarmentTagsLocally, type LocalTagHints } from "@/lib/wardrobe/local-tagger";
import type { GarmentTagResponse } from "@/types/closet";

export const maxDuration = 30;

// Compressed uploads are ~40-150 KB. Anything near Vercel's 4.5 MB function
// limit means the client skipped compression, so reject it early.
const MAX_BODY_BYTES = 1.5 * 1024 * 1024;
const AI_TIMEOUT_MS = 20_000;
const DATA_URL_PATTERN = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/;
const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

const TAG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "category", "color", "material", "fit", "season", "formality", "styleTags"],
  properties: {
    name: { type: "string", description: "Short product-style name, 2-5 words, e.g. 'Navy Oxford Shirt'." },
    category: { type: "string", enum: [...GARMENT_CATEGORIES] },
    color: {
      type: "object",
      additionalProperties: false,
      required: ["name", "hex"],
      properties: {
        name: { type: "string", enum: GARMENT_COLOR_PALETTE.map((color) => color.name) },
        hex: { type: "string", description: "Dominant garment color as #RRGGBB." },
      },
    },
    material: { type: "string", description: "Most likely fabric, e.g. 'Cotton', 'Denim', 'Wool blend'." },
    fit: { type: "string", enum: [...CLOSET_FITS] },
    season: { type: "string", enum: [...CLOSET_SEASONS] },
    formality: { type: "string", enum: [...CLOSET_FORMALITIES] },
    styleTags: {
      type: "array",
      items: { type: "string" },
      description: "2-5 lowercase style descriptors, e.g. 'minimal', 'utility', 'preppy'.",
    },
  },
} as const;

const SYSTEM_PROMPT = [
  "You are a meticulous fashion cataloguer for a personal digital closet.",
  "Describe only the single main garment or accessory in the photo. Ignore people, backgrounds, and props.",
  "Use 'outerwear' for jackets, coats, blazers, and cardigans worn as a layer.",
  "Pick the closest palette color name for the garment's dominant color.",
  "If unsure, choose the most likely value instead of refusing.",
].join(" ");

function decodedBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function parseHints(body: Record<string, unknown>): LocalTagHints {
  const dimension = (value: unknown) => (
    typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 20_000 ? value : undefined
  );
  return {
    fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 200) : undefined,
    dominantHex: typeof body.dominantHex === "string" && HEX_PATTERN.test(body.dominantHex) ? body.dominantHex : undefined,
    width: dimension(body.width),
    height: dimension(body.height),
  };
}

function tagResponse(body: GarmentTagResponse): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonError(error.status, error.message);
    return jsonError(400, "The request body could not be read.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Send a JSON object with an imageDataUrl field.");
  }
  const record = body as Record<string, unknown>;
  const imageDataUrl = typeof record.imageDataUrl === "string" ? record.imageDataUrl : "";
  const match = DATA_URL_PATTERN.exec(imageDataUrl);
  if (!match) {
    return jsonError(400, "imageDataUrl must be a base64 WebP, JPEG, or PNG data URL.");
  }
  if (decodedBase64Bytes(match[2]) > MAX_BODY_BYTES) {
    return jsonError(413, "The image is too large. Compress it before tagging.");
  }

  const hints = parseHints(record);
  const provider = resolveLlmProvider();
  if (!provider) {
    return tagResponse({ tags: inferGarmentTagsLocally(hints), source: "fallback", fallbackReason: "no-api-key" });
  }

  try {
    const result = await requestStructuredCompletion(provider, {
      system: SYSTEM_PROMPT,
      user: [
        { type: "text", text: "Tag this clothing item for the closet." },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
      schemaName: "garment_tags",
      schema: TAG_SCHEMA,
      timeoutMs: AI_TIMEOUT_MS,
      maxTokens: 400,
    });

    const tags = sanitizeGarmentTags(result);
    if (!tags) {
      return tagResponse({
        tags: inferGarmentTagsLocally(hints),
        source: "fallback",
        fallbackReason: "invalid-ai-response",
      });
    }
    return tagResponse({ tags, source: provider.name, model: provider.model });
  } catch (error) {
    // The upload must never fail because the AI did; the user reviews tags anyway.
    console.warn(`[wardrobe/tag] ${provider.name} tagging failed:`, error instanceof LlmError ? error.message : error);
    return tagResponse({
      tags: inferGarmentTagsLocally(hints),
      source: "fallback",
      fallbackReason: "provider-error",
    });
  }
}
