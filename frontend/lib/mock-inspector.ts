import type { GarmentBox, OutfitAnalysisResponse } from "@/types/outfit";

export interface MockAnalysisStage {
  id: "normalize" | "detect" | "describe" | "finish";
  label: string;
  description: string;
  durationMs: number;
  progress: number;
}

export const MOCK_ANALYSIS_STAGES: readonly MockAnalysisStage[] = [
  {
    id: "normalize",
    label: "Preparing image",
    description: "Checking composition and image quality",
    durationMs: 550,
    progress: 18,
  },
  {
    id: "detect",
    label: "Finding garments",
    description: "Mapping layers, accessories, and footwear",
    durationMs: 800,
    progress: 48,
  },
  {
    id: "describe",
    label: "Reading details",
    description: "Estimating color, material, and silhouette",
    durationMs: 700,
    progress: 78,
  },
  {
    id: "finish",
    label: "Building inspector",
    description: "Connecting every region to its garment card",
    durationMs: 500,
    progress: 100,
  },
] as const;

const MOCK_GARMENTS: GarmentBox[] = [
  {
    id: "mock-outerwear",
    category: "outerwear",
    label: "Relaxed Oatmeal Overshirt",
    confidence: 0.97,
    box_2d: [176, 274, 526, 724],
    color: "warm oatmeal",
    material_estimate: "linen blend",
    silhouette: "relaxed layer",
    crop_base64: null,
  },
  {
    id: "mock-top",
    category: "top",
    label: "Charcoal Crewneck Tee",
    confidence: 0.95,
    box_2d: [208, 388, 492, 615],
    color: "charcoal black",
    material_estimate: "cotton jersey",
    silhouette: "clean regular fit",
    crop_base64: null,
  },
  {
    id: "mock-bottom",
    category: "bottom",
    label: "Wide Straight Trousers",
    confidence: 0.98,
    box_2d: [443, 330, 914, 704],
    color: "soft black",
    material_estimate: "brushed twill",
    silhouette: "wide straight leg",
    crop_base64: null,
  },
  {
    id: "mock-footwear",
    category: "footwear",
    label: "Minimal Court Sneakers",
    confidence: 0.96,
    box_2d: [878, 332, 978, 752],
    color: "off white",
    material_estimate: "smooth leather",
    silhouette: "low profile",
    crop_base64: null,
  },
  {
    id: "mock-accessory",
    category: "accessory",
    label: "Compact Crossbody Bag",
    confidence: 0.92,
    box_2d: [182, 408, 474, 672],
    color: "black",
    material_estimate: "matte leather",
    silhouette: "compact structured",
    crop_base64: null,
  },
];

interface MockAnalysisOptions {
  imageSource: string;
  sourceName: string;
  signal?: AbortSignal;
  onStage?: (stage: MockAnalysisStage, index: number) => void;
}

function createAbortError() {
  const error = new Error("Mock analysis cancelled");
  error.name = "AbortError";
  return error;
}

function waitForStage(durationMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, durationMs);

    const abort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function analyzeOutfitMock({
  imageSource,
  sourceName,
  signal,
  onStage,
}: MockAnalysisOptions): Promise<OutfitAnalysisResponse> {
  for (const [index, stage] of MOCK_ANALYSIS_STAGES.entries()) {
    onStage?.(stage, index);
    await waitForStage(stage.durationMs, signal);
  }

  return {
    session_id: `mock-${Date.now()}`,
    processed_image_base64: imageSource,
    overall_vibe: "Soft Utility Minimalism",
    detected_garments: MOCK_GARMENTS.map((garment) => ({ ...garment })),
    style_breakdown: {
      source: sourceName,
      color_palette: "Warm neutrals grounded by charcoal",
      fit: "Relaxed layers with a straight lower silhouette",
      styling_note: "Tonal texture creates depth without visual noise",
    },
    build_suggestions: [],
  };
}
