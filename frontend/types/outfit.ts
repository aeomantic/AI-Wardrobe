export type GarmentCategory =
  | "outerwear"
  | "top"
  | "bottom"
  | "footwear"
  | "accessory"
  | "one-piece";

export interface GarmentBox {
  id: string;
  category: GarmentCategory;
  label: string;
  confidence: number;
  box_2d: [number, number, number, number];
  color: string;
  material_estimate: string;
  silhouette: string;
  crop_base64: string | null;
}

export interface OutfitAnalysisResponse {
  session_id: string;
  processed_image_base64: string;
  overall_vibe: string;
  detected_garments: GarmentBox[];
  style_breakdown: Record<string, string>;
  build_suggestions: Array<Record<string, string>>;
}
