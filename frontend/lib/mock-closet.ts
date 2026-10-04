import type {
  ClosetCategory,
  ClosetColor,
  ClosetFilter,
  ClosetItem,
  ClosetSeason,
  GeneratedClosetOutfit,
  StyleOccasion,
  WeatherProfile,
} from "@/types/closet";

export const CATEGORY_LABELS: Record<ClosetFilter, string> = {
  all: "All",
  top: "Tops",
  bottom: "Bottoms",
  outerwear: "Outerwear",
  footwear: "Footwear",
  accessory: "Accessories",
};

export const CATEGORY_TABS = Object.entries(CATEGORY_LABELS) as [ClosetFilter, string][];

export const SEASON_OPTIONS: ClosetSeason[] = [
  "All season",
  "Spring",
  "Summer",
  "Autumn",
  "Winter",
];

export const COLOR_OPTIONS: ClosetColor[] = [
  { name: "Cream", hex: "#E8E0D0" },
  { name: "Black", hex: "#252525" },
  { name: "Navy", hex: "#273349" },
  { name: "Slate", hex: "#6D7378" },
  { name: "Denim", hex: "#6F849A" },
  { name: "Olive", hex: "#74745B" },
  { name: "Clay", hex: "#A8664C" },
  { name: "Silver", hex: "#B9BAB8" },
];

const GARMENT_SHAPES: Record<ClosetCategory, string> = {
  top: '<path d="M122 105 82 128 48 112 24 162l47 22 10-18v151h126V166l10 18 47-22-24-50-34 16-40-23c-8 18-36 18-44 0Z"/>',
  bottom: '<path d="M89 93h110l16 80-29 176h-48l-4-137-5 137H81L53 173l17-80Z"/>',
  outerwear: '<path d="M120 90 77 112 41 154l35 33 17-18v165h126V169l17 18 35-33-36-42-43-22-19 36-8-21h-14l-9 21Z"/><path d="M156 111v223" fill="none" stroke="white" stroke-opacity=".35" stroke-width="3"/>',
  footwear: '<path d="M56 199c42 22 70 25 101 11l32 33c24 4 53 14 65 33 5 8 1 22-12 25H56c-18 0-27-11-24-25l10-66c2-12 5-15 14-11Z"/><path d="M45 273h199" fill="none" stroke="white" stroke-opacity=".4" stroke-width="5"/>',
  accessory: '<rect x="62" y="137" width="176" height="148" rx="25"/><path d="M105 141c0-68 90-68 90 0" fill="none" stroke="currentColor" stroke-width="18"/>',
};

function closetArt(
  category: ClosetCategory,
  color: string,
  accent: string,
  label: string,
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7f4ed"/><stop offset="1" stop-color="${accent}" stop-opacity=".34"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-opacity=".18"/></filter>
    </defs>
    <rect width="300" height="400" rx="32" fill="url(#bg)"/>
    <circle cx="240" cy="72" r="42" fill="${accent}" opacity=".32"/>
    <g fill="${color}" color="${color}" filter="url(#shadow)">${GARMENT_SHAPES[category]}</g>
    <text x="24" y="372" fill="#5b5851" font-family="Arial, sans-serif" font-size="13" letter-spacing="1.5">${label.toUpperCase()}</text>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const SEED_CLOSET_ITEMS: ClosetItem[] = [
  {
    id: "closet-ivory-tank",
    name: "Ivory Rib Tank",
    category: "top",
    season: "Summer",
    color: COLOR_OPTIONS[0],
    imageSrc: closetArt("top", "#DDD1BD", "#E4CAB1", "Ivory rib"),
    styleTags: ["minimal", "fitted"],
    backgroundRemoved: true,
    createdAt: "2026-08-10T09:00:00.000Z",
  },
  {
    id: "closet-ink-oxford",
    name: "Ink Oxford Shirt",
    category: "top",
    season: "All season",
    color: COLOR_OPTIONS[2],
    imageSrc: closetArt("top", "#273349", "#AAB4C3", "Ink oxford"),
    styleTags: ["tailored", "clean"],
    backgroundRemoved: true,
    createdAt: "2026-08-11T09:00:00.000Z",
  },
  {
    id: "closet-clay-knit",
    name: "Clay Fine Knit",
    category: "top",
    season: "Autumn",
    color: COLOR_OPTIONS[6],
    imageSrc: closetArt("top", "#A8664C", "#D6B199", "Clay knit"),
    styleTags: ["soft", "textured"],
    backgroundRemoved: true,
    createdAt: "2026-08-12T09:00:00.000Z",
  },
  {
    id: "closet-slate-trouser",
    name: "Slate Tailored Trouser",
    category: "bottom",
    season: "All season",
    color: COLOR_OPTIONS[3],
    imageSrc: closetArt("bottom", "#666C72", "#BAB7B0", "Slate trouser"),
    styleTags: ["wide leg", "polished"],
    backgroundRemoved: true,
    createdAt: "2026-08-13T09:00:00.000Z",
  },
  {
    id: "closet-washed-denim",
    name: "Washed Straight Denim",
    category: "bottom",
    season: "All season",
    color: COLOR_OPTIONS[4],
    imageSrc: closetArt("bottom", "#71869B", "#B9C8D6", "Washed denim"),
    styleTags: ["relaxed", "everyday"],
    backgroundRemoved: true,
    createdAt: "2026-08-14T09:00:00.000Z",
  },
  {
    id: "closet-field-jacket",
    name: "Olive Field Jacket",
    category: "outerwear",
    season: "Autumn",
    color: COLOR_OPTIONS[5],
    imageSrc: closetArt("outerwear", "#74745B", "#C1BDA1", "Field jacket"),
    styleTags: ["utility", "layering"],
    backgroundRemoved: true,
    createdAt: "2026-08-15T09:00:00.000Z",
  },
  {
    id: "closet-black-loafers",
    name: "Soft Black Loafers",
    category: "footwear",
    season: "All season",
    color: COLOR_OPTIONS[1],
    imageSrc: closetArt("footwear", "#262626", "#AAA7A1", "Black loafer"),
    styleTags: ["refined", "low profile"],
    backgroundRemoved: true,
    createdAt: "2026-08-16T09:00:00.000Z",
  },
  {
    id: "closet-cream-sneaker",
    name: "Cream Court Sneakers",
    category: "footwear",
    season: "All season",
    color: COLOR_OPTIONS[0],
    imageSrc: closetArt("footwear", "#DCD4C5", "#CDC2AF", "Court sneaker"),
    styleTags: ["sporty", "minimal"],
    backgroundRemoved: true,
    createdAt: "2026-08-17T09:00:00.000Z",
  },
  {
    id: "closet-silver-bag",
    name: "Silver Mini Bag",
    category: "accessory",
    season: "All season",
    color: COLOR_OPTIONS[7],
    imageSrc: closetArt("accessory", "#B9BAB8", "#D8D8D5", "Silver bag"),
    styleTags: ["statement", "compact"],
    backgroundRemoved: true,
    createdAt: "2026-08-18T09:00:00.000Z",
  },
];

export function inferMockTags(fileName: string): {
  name: string;
  category: ClosetCategory;
  season: ClosetSeason;
  color: ClosetColor;
  styleTags: string[];
} {
  const normalized = fileName.toLowerCase();
  const category: ClosetCategory = normalized.match(/shoe|sneaker|boot|loafer/)
    ? "footwear"
    : normalized.match(/pant|jean|skirt|short/)
      ? "bottom"
      : normalized.match(/jacket|coat|blazer/)
        ? "outerwear"
        : normalized.match(/bag|hat|belt|scarf/)
          ? "accessory"
          : "top";
  const color = normalized.match(/black|dark/)
    ? COLOR_OPTIONS[1]
    : normalized.match(/blue|navy/)
      ? COLOR_OPTIONS[2]
      : normalized.match(/red|rust|clay/)
        ? COLOR_OPTIONS[6]
        : COLOR_OPTIONS[0];
  const cleanedName = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();

  return {
    name: cleanedName || "New Closet Piece",
    category,
    season: category === "outerwear" ? "Autumn" : "All season",
    color,
    styleTags: category === "footwear" ? ["versatile", "clean"] : ["everyday", "easy layer"],
  };
}

const OUTFIT_COPY: Record<StyleOccasion, { titles: string[]; descriptions: string[] }> = {
  Casual: {
    titles: ["Easy Layers", "Clean Weekend", "Relaxed Contrast"],
    descriptions: [
      "Low-effort proportions with one intentional finishing piece.",
      "A crisp everyday mix that still feels considered.",
      "Soft structure balanced by a grounded shoe and simple color story.",
    ],
  },
  Work: {
    titles: ["Quiet Authority", "Soft Tailoring", "Desk to Dinner"],
    descriptions: [
      "Polished lines without making the outfit feel overly formal.",
      "A composed palette with enough ease for a full day.",
      "Professional foundations with a sharper finishing detail.",
    ],
  },
  "Night Out": {
    titles: ["After Dark", "Tonal Statement", "Late Reservation"],
    descriptions: [
      "A compact silhouette with contrast focused around the accessories.",
      "Confident color balance built from pieces you already own.",
      "A sharper remix that moves easily from dinner to drinks.",
    ],
  },
};

const WEATHER_NOTES: Record<WeatherProfile, string> = {
  Warm: "Keep the base breathable and let the accessories carry the visual weight.",
  Mild: "Use one optional layer so the proportions stay flexible through the day.",
  Cool: "Build warmth through a close base and structured outer layer.",
};

export function buildMockOutfits(
  items: ClosetItem[],
  occasion: StyleOccasion,
  weather: WeatherProfile,
  pinnedItemIds: string[] = [],
): GeneratedClosetOutfit[] {
  if (items.length === 0) return [];

  const pinned = new Set(pinnedItemIds);
  const categoryOrder: ClosetCategory[] = ["top", "bottom", "outerwear", "footwear", "accessory"];
  const eligibleCategories = weather === "Warm"
    ? categoryOrder.filter((category) => category !== "outerwear")
    : categoryOrder;
  const occasionOffset = occasion === "Casual" ? 0 : occasion === "Work" ? 1 : 2;
  const copy = OUTFIT_COPY[occasion];

  return Array.from({ length: 3 }, (_, outfitIndex) => {
    const chosen = eligibleCategories.flatMap((category, categoryIndex) => {
      const options = items.filter((item) => item.category === category);
      if (options.length === 0) return [];
      const pinnedOptions = options.filter((item) => pinned.has(item.id));
      const rotation = pinnedOptions.length > 0 ? pinnedOptions : options;
      const rotationIndex = pinnedOptions.length > 0
        ? outfitIndex
        : outfitIndex + categoryIndex + occasionOffset;
      return [rotation[rotationIndex % rotation.length].id];
    });

    if (chosen.length === 0) chosen.push(items[outfitIndex % items.length].id);

    return {
      id: `mock-${occasion.toLowerCase().replaceAll(" ", "-")}-${weather.toLowerCase()}-${outfitIndex + 1}`,
      title: copy.titles[outfitIndex],
      description: copy.descriptions[outfitIndex],
      stylingNote: WEATHER_NOTES[weather],
      occasion,
      weather,
      itemIds: [...new Set(chosen)],
    };
  });
}
