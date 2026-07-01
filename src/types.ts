export type MediaType = "image" | "video";

export type MediaAlign = "left" | "center" | "right";

export type MediaFitMode = "contain" | "cover";

export type MediaSourceType = "vault" | "url";

export type CaptionAlign = "left" | "center";

export interface VisualMediaItem {
  id: string;
  type: MediaType;
  src: string;
  sourceType: MediaSourceType;
  alt: string;
  caption?: string;
  captionAlign?: CaptionAlign;
  align: MediaAlign;
  width: number;
  aspectRatio?: number;
  fit: MediaFitMode;
}

export interface VisualMediaRow {
  id: string;
  align: MediaAlign;
  height: number;
  items: VisualMediaItem[];
}

export interface VisualMediaLayout {
  version: 1;
  nativeFallback?: boolean;
  rows: VisualMediaRow[];
}
