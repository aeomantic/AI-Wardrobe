import type { OutfitAnalysisResponse } from "@/types/outfit";

const NAMED_COLORS: Record<string, string> = {
  black: "#1b1b19",
  charcoal: "#343432",
  white: "#f7f5ee",
  cream: "#e9dfca",
  ivory: "#eee9dc",
  oatmeal: "#cabb9f",
  beige: "#c8b695",
  brown: "#795947",
  tan: "#b78f63",
  camel: "#a9784d",
  grey: "#8d8c87",
  gray: "#8d8c87",
  navy: "#243047",
  blue: "#3f62a2",
  denim: "#56718f",
  red: "#a7443f",
  burgundy: "#71363e",
  green: "#4e6750",
  olive: "#73764d",
  yellow: "#d9ad4b",
  orange: "#cc7646",
  pink: "#c78e9b",
  purple: "#735c88",
  silver: "#b8bab7",
  gold: "#b79248",
};

export function toImageSource(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^(data:|blob:|https?:\/\/|\/)/i.test(value)) return value;
  return `data:image/jpeg;base64,${value}`;
}

export function colorToCss(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/i.test(normalized)) return normalized;
  const match = Object.entries(NAMED_COLORS).find(([name]) => normalized.includes(name));
  return match?.[1] ?? "#b8b1a4";
}

export function humanizeKey(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isOutfitAnalysisResponse(value: unknown): value is OutfitAnalysisResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<OutfitAnalysisResponse>;
  if (
    typeof response.session_id !== "string" ||
    typeof response.processed_image_base64 !== "string" ||
    typeof response.overall_vibe !== "string" ||
    !Array.isArray(response.detected_garments) ||
    !Array.isArray(response.build_suggestions) ||
    !response.style_breakdown ||
    typeof response.style_breakdown !== "object"
  ) {
    return false;
  }

  return response.detected_garments.every((garment) =>
    Boolean(
      garment &&
        typeof garment.id === "string" &&
        typeof garment.category === "string" &&
        typeof garment.label === "string" &&
        typeof garment.confidence === "number" &&
        Array.isArray(garment.box_2d) &&
        garment.box_2d.length === 4,
    ),
  );
}
