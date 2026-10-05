export type ClosetCategory =
  | "top"
  | "bottom"
  | "outerwear"
  | "footwear"
  | "accessory"
  | "inspiration";

export type ClosetFilter = "all" | ClosetCategory;

export type ClosetSeason = "All season" | "Spring" | "Summer" | "Autumn" | "Winter";

export interface ClosetColor {
  name: string;
  hex: string;
}

export interface ClosetItem {
  id: string;
  name: string;
  category: ClosetCategory;
  season: ClosetSeason;
  color: ClosetColor;
  imageSrc: string;
  sourceUrl?: string;
  styleTags: string[];
  backgroundRemoved: boolean;
  createdAt: string;
}

export type NewClosetItem = Omit<ClosetItem, "id" | "createdAt">;

export type StyleOccasion = "Casual" | "Work" | "Night Out";

export type WeatherProfile = "Warm" | "Mild" | "Cool";

export interface GeneratedClosetOutfit {
  id: string;
  title: string;
  description: string;
  stylingNote: string;
  occasion: StyleOccasion;
  weather: WeatherProfile;
  itemIds: string[];
}
