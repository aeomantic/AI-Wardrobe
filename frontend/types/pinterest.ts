export interface PinterestImportItem {
  id: string;
  title: string;
  imageUrl: string;
  link: string;
}

export interface PinterestImportError {
  error: string;
}

export type PinterestImportResponse =
  | PinterestImportItem[]
  | PinterestImportError;
