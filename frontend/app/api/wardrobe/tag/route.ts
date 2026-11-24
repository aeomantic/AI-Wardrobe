import {
  describeLlmError,
  LlmError,
  requestStructuredCompletion,
  resolveLlmProvider,
  type LlmProvider,
} from "@/lib/ai/llm";
import { jsonError, readJsonBody, RequestBodyError } from "@/lib/http/json-body";
import {
  CLOSET_FITS,
  CLOSET_FORMALITIES,
  CLOSET_SEASONS,
  GARMENT_CATEGORIES,
  GARMENT_COLOR_PALETTE,
  GARMENT_PHOTO_TYPES,
  paletteColorByName,
  paletteColorFromText,
  sanitizeColor,
  sanitizeGarmentTags,
  sanitizeVisualAnalysis,
} from "@/lib/wardrobe/garment-tags";
import { inferGarmentTagsLocally, type LocalTagHints } from "@/lib/wardrobe/local-tagger";
import type {
  ClosetColor,
  GarmentTagResponse,
  GarmentTags,
  GarmentVisualAnalysis,
  TagFallbackReason,
} from "@/types/closet";

export const maxDuration = 30;

// Compressed uploads are ~40-150 KB. Anything near Vercel's 4.5 MB function
// limit means the client skipped compression, so reject it early.
const MAX_BODY_BYTES = 1.5 * 1024 * 1024;
const AI_TIMEOUT_MS = 22_000;
// Low temperature keeps attribute classification repeatable where the model honors it.
const TAG_TEMPERATURE = 0.1;
const MAX_STYLE_TAGS = 5;
const DATA_URL_PATTERN = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/;
const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

/*
 * Key order matters: structured output emits keys in schema order, so the
 * model writes visualAnalysis before it commits to fit, color, or name.
 */
const VISUAL_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["photoType", "shoulderConstruction", "sleeveProportion", "bodySilhouette", "trueGarmentColor"],
  properties: {
    photoType: {
      type: "string",
      enum: [...GARMENT_PHOTO_TYPES],
      description: "How the garment is shown. Use 'other' for shoes, bags, and product shots.",
    },
    shoulderConstruction: {
      type: "string",
      description: "One sentence: where the shoulder seams sit relative to the hanger tips, the collar line, or the wearer's shoulder bone. 'n/a' if the item has no shoulders.",
    },
    sleeveProportion: {
      type: "string",
      description: "One sentence: sleeve length and opening width, e.g. 'wide half-sleeve reaching near the elbow' vs 'standard mid-bicep short sleeve'. For bottoms, describe rise, thigh width, taper, and leg opening.",
    },
    bodySilhouette: {
      type: "string",
      description: "One sentence: torso width-to-length ratio, drape, and boxiness, or the overall shape of bottoms, shoes, and accessories.",
    },
    trueGarmentColor: {
      type: "string",
      description: "Nuanced fashion color of the fabric only, e.g. 'sage green', 'washed charcoal', 'off-white'.",
    },
  },
} as const;

const TAG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["visualAnalysis", "name", "category", "color", "material", "fit", "season", "formality", "styleTags"],
  properties: {
    visualAnalysis: VISUAL_ANALYSIS_SCHEMA,
    name: {
      type: "string",
      description: "2-6 words in Title Case: nuanced color + fit (omit when Regular) + specific garment type, e.g. 'Sage Green Oversized Crewneck Tee'.",
    },
    category: { type: "string", enum: [...GARMENT_CATEGORIES] },
    color: {
      type: "string",
      enum: GARMENT_COLOR_PALETTE.map((color) => color.name),
      description: "The palette color closest to trueGarmentColor.",
    },
    material: { type: "string", description: "Best visual fabric estimate, e.g. 'Heavyweight Cotton', 'Fleece', 'Denim', 'Linen', 'Nylon'." },
    fit: { type: "string", enum: [...CLOSET_FITS] },
    season: { type: "string", enum: [...CLOSET_SEASONS] },
    formality: { type: "string", enum: [...CLOSET_FORMALITIES] },
    styleTags: {
      type: "array",
      items: { type: "string" },
      description: "3-5 specific lowercase fashion tags, e.g. 'streetwear', 'boxy', 'drop-shoulder', 'minimalist'.",
    },
  },
} as const;

const SYSTEM_PROMPT = `You are an expert menswear and streetwear technical designer and fashion merchandiser. You catalogue ONE primary garment per photo for a personal digital closet.

FOREGROUND ISOLATION
- Photos show the garment on a hanger, laid flat on a bed or floor, or worn by a person.
- Ignore everything that is not the garment: wardrobe doors, walls, floors, bedding, hangers, hooks, hands, skin, hair, and other clothing. They must never influence color, pattern, or silhouette.
- Judge color strictly from the center fabric of the garment itself, away from shadows, highlights, seams, and prints. If several garments are visible, describe the largest, most central one.

WORK ORDER
Write visualAnalysis first, describing only what you can see. Then decide every other field from that analysis. Never decide fit before describing the shoulders, sleeves, and silhouette.

FIT RUBRIC (hanger, flat-lay, and worn photos)
- Oversized: any 2 or more of: shoulder seams dropped visibly past the hanger tips, the outer collar line, or the wearer's shoulder bone; wide, elongated short sleeves reaching toward the elbow (half-sleeves); a wide, boxy torso whose width looks generous relative to its length; a thick or heavyweight ribbed collar with a structured street-style drape. Bottoms: very wide, baggy legs with extra length.
- Relaxed: roomier than standard through the chest, body, or leg, with a mild shoulder drop or a wider hem, but without extreme boxy proportions. Bottoms: loose or straight-wide legs.
- Regular: shoulder seams sit cleanly at the hanger ends or the wearer's shoulder, standard mid-bicep short sleeves, and a balanced straight torso without excess width. Bottoms: straight leg.
- Slim: narrow chest, tapered waist or leg, high armholes, close-fitting sleeves.
- Tailored: structured, pressed, suit-cut construction such as blazers, suit trousers, and close-cut dress shirts.
- Do NOT default to Regular. If dropped shoulders or wide or long half-sleeves are visible, the fit is Relaxed or Oversized, never Regular.
- Footwear and accessories: use Regular.

FIELDS
- name: nuanced color + fit (omit when Regular) + specific garment type, e.g. "Sage Green Oversized Crewneck Tee", "Washed Charcoal Relaxed Hoodie". Never guess brands.
- category: top = tees, shirts, polos, knitwear, hoodies, sweatshirts, tanks. outerwear = jackets, coats, blazers, overshirts, shackets, cardigans, gilets. bottom = trousers, jeans, chinos, joggers, shorts, skirts. footwear = all shoes. accessory = bags, belts, hats, scarves, ties, watches, jewelry, sunglasses.
- color: the palette name closest to trueGarmentColor. Sage, mint, or forest green -> Green. Army or moss green -> Olive. Washed charcoal -> Charcoal. Off-white, ecru, or ivory -> Cream. Heather grey -> Grey. Use Multi only for prints or color-blocking with no dominant color.
- season: All season for everyday mid-weight pieces. Summer for linen, shorts, tanks, and very light fabrics. Winter for puffers, heavy wool, and thermal pieces. Autumn or Spring for mid-weight layers such as light jackets, flannels, and knits.
- formality: Casual = tees, hoodies, sweatshirts, joggers, sneakers, graphic or distressed pieces. Smart casual = oxford and linen shirts, polos, chinos, knitwear, overshirts, loafers. Business = dress shirts, suit trousers, blazers, ties. Formal = suits, tuxedos, formal dress shoes.
- styleTags: 3-5 specific lowercase tags.

If you are unsure, choose the most likely value. Never refuse.`;

const USER_PROMPT = "Analyze the primary garment in this photo. Write visualAnalysis first, then fill in the remaining fields from it.";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Maps the model's palette name (or, in prompt-only mode, any color text) to a palette color. */
function resolveColor(raw: Record<string, unknown>, analysis: GarmentVisualAnalysis | null): ClosetColor | null {
  if (typeof raw.color === "string") {
    return paletteColorByName(raw.color) ?? paletteColorFromText(raw.color) ?? paletteColorFromText(analysis?.trueGarmentColor ?? "");
  }
  return sanitizeColor(raw.color) ?? paletteColorFromText(analysis?.trueGarmentColor ?? "");
}

function normalizeVisionResult(raw: unknown): { tags: GarmentTags; visualAnalysis: GarmentVisualAnalysis | null } | null {
  if (!isRecord(raw)) return null;
  const visualAnalysis = sanitizeVisualAnalysis(raw.visualAnalysis);
  const tags = sanitizeGarmentTags({ ...raw, color: resolveColor(raw, visualAnalysis) });
  if (!tags) return null;
  return { tags: { ...tags, styleTags: tags.styleTags.slice(0, MAX_STYLE_TAGS) }, visualAnalysis };
}

function tagResponse(body: GarmentTagResponse): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function localFallback(hints: LocalTagHints, reason: TagFallbackReason, logLine: string): Response {
  // Fallbacks are never silent: missing keys are a setup warning, the rest are errors.
  const message = `[wardrobe/tag] local-fallback (${reason}): ${logLine}`;
  if (reason === "missing_api_key") console.warn(message);
  else console.error(message);
  return tagResponse({ tags: inferGarmentTagsLocally(hints), tagSource: "local-fallback", fallbackReason: reason });
}

function providerLabel(provider: LlmProvider): string {
  return `${provider.name}/${provider.model}`;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonError(error.status, error.message);
    return jsonError(400, "The request body could not be read.");
  }

  if (!isRecord(body)) {
    return jsonError(400, "Send a JSON object with an imageDataUrl field.");
  }
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  const match = DATA_URL_PATTERN.exec(imageDataUrl);
  if (!match) {
    return jsonError(400, "imageDataUrl must be a base64 WebP, JPEG, or PNG data URL.");
  }
  if (decodedBase64Bytes(match[2]) > MAX_BODY_BYTES) {
    return jsonError(413, "The image is too large. Compress it before tagging.");
  }

  const hints = parseHints(body);
  const provider = resolveLlmProvider();
  if (!provider) {
    return localFallback(
      hints,
      "missing_api_key",
      "no vision key is set. Add OPENAI_API_KEY, GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY), or GROQ_API_KEY to the server environment.",
    );
  }

  let raw: unknown;
  try {
    raw = await requestStructuredCompletion(provider, {
      system: SYSTEM_PROMPT,
      user: [
        { type: "text", text: USER_PROMPT },
        // High detail keeps seams, fabric texture, and drape legible for fit calls.
        { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
      ],
      schemaName: "garment_tags",
      schema: TAG_SCHEMA,
      timeoutMs: AI_TIMEOUT_MS,
      maxTokens: 900,
      temperature: TAG_TEMPERATURE,
    });
  } catch (error) {
    // The upload must never fail because the AI did; the user reviews tags anyway.
    const reason = error instanceof LlmError && error.isUnusableResponse ? "parse_error" : "api_error";
    return localFallback(hints, reason, `${providerLabel(provider)} ${describeLlmError(error)}`);
  }

  const result = normalizeVisionResult(raw);
  if (!result) {
    const preview = JSON.stringify(raw)?.slice(0, 200) ?? String(raw);
    return localFallback(hints, "parse_error", `${providerLabel(provider)} returned JSON without a valid name, category, and color: ${preview}`);
  }

  return tagResponse({
    tags: result.tags,
    tagSource: "ai-vision",
    provider: provider.name,
    model: provider.model,
    ...(result.visualAnalysis ? { visualAnalysis: result.visualAnalysis } : {}),
  });
}
