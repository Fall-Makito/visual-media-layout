import type {
  CaptionAlign,
  MediaAlign,
  MediaFitMode,
  MediaSourceType,
  MediaType,
  VisualMediaItem,
  VisualMediaLayout,
  VisualMediaRow,
} from "./types";

const DEFAULT_WIDTH = 360;
const DEFAULT_ROW_HEIGHT = 220;
const MAX_ITEMS_PER_ROW = 4;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);

export function parseVisualMediaLayout(source: string): VisualMediaLayout | null {
  try {
    const parsed = JSON.parse(source) as unknown;
    return normalizeVisualMediaLayout(parsed);
  } catch {
    return null;
  }
}

export function createEmptyVisualMediaLayout(): VisualMediaLayout {
  return {
    version: 1,
    nativeFallback: false,
    rows: [],
  };
}

export function parseMarkdownMediaToLayout(markdown: string): VisualMediaLayout | null {
  const items: VisualMediaItem[] = [];
  let itemIndex = 1;

  for (const line of markdown.split(/\r?\n/)) {
    for (const parsed of parseMarkdownMediaLine(line)) {
      items.push({
        ...parsed,
        id: `item-${itemIndex}`,
      });
      itemIndex += 1;
    }
  }

  if (items.length === 0) {
    return null;
  }

  return createLayoutFromItems(items);
}

export function createLayoutFromItems(items: VisualMediaItem[]): VisualMediaLayout {
  const rows: VisualMediaRow[] = [];

  for (let index = 0; index < items.length; index += MAX_ITEMS_PER_ROW) {
    const rowItems = items.slice(index, index + MAX_ITEMS_PER_ROW);
    rows.push({
      id: `row-${rows.length + 1}`,
      align: "center",
      height: getPreferredRowHeight(rowItems),
      items: rowItems,
    });
  }

  return {
    version: 1,
    nativeFallback: false,
    rows,
  };
}

function normalizeVisualMediaLayout(value: unknown): VisualMediaLayout | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.rows)) {
    return null;
  }

  const rows: VisualMediaRow[] = [];

  for (const rowValue of value.rows) {
    const row = normalizeVisualMediaRow(rowValue);
    if (!row) {
      continue;
    }

    for (let index = 0; index < row.items.length; index += MAX_ITEMS_PER_ROW) {
      rows.push({
        ...row,
        id: rows.length === 0 && index === 0 ? row.id : `row-${rows.length + 1}`,
        items: row.items.slice(index, index + MAX_ITEMS_PER_ROW),
      });
    }
  }

  return {
    version: 1,
    rows: ensureUniqueLayoutIds(rows),
  };
}

function normalizeVisualMediaRow(value: unknown): VisualMediaRow | null {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }

  const items = value.items
    .map((item) => normalizeVisualMediaItem(item))
    .filter((item): item is VisualMediaItem => item !== null);

  return {
    id: getString(value.id, "row"),
    align: getAlign(value.align),
    height: clampNumber(value.height, 80, 900, DEFAULT_ROW_HEIGHT),
    items,
  };
}

function ensureUniqueLayoutIds(rows: VisualMediaRow[]): VisualMediaRow[] {
  const rowIds = new Set<string>();
  const itemIds = new Set<string>();

  return rows.map((row, rowIndex) => {
    const rowId = createUniqueId(row.id || "row", rowIds, rowIndex + 1);
    const items = row.items.map((item, itemIndex) => ({
      ...item,
      id: createUniqueId(item.id || "item", itemIds, itemIndex + 1),
    }));

    return {
      ...row,
      id: rowId,
      items,
    };
  });
}

function createUniqueId(baseId: string, usedIds: Set<string>, fallbackIndex: number): string {
  let id = baseId;
  if (!id || usedIds.has(id)) {
    id = `${baseId || "id"}-${fallbackIndex}`;
  }

  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId || "id"}-${fallbackIndex}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(id);
  return id;
}

function normalizeVisualMediaItem(value: unknown): VisualMediaItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const src = getString(value.src, "");
  const type = getMediaType(src, value.type);
  if (!src || !type) {
    return null;
  }

  return {
    id: getString(value.id, "item"),
    type,
    src,
    sourceType: getSourceType(src, value.sourceType),
    alt: getString(value.alt, ""),
    caption: getOptionalString(value.caption),
    captionAlign: getCaptionAlign(value.captionAlign),
    align: getAlign(value.align),
    width: clampNumber(value.width, 80, 5000, DEFAULT_WIDTH),
    aspectRatio: getOptionalPositiveNumber(value.aspectRatio),
    fit: getFitMode(value.fit),
  };
}

function parseMarkdownMediaLine(line: string): VisualMediaItem[] {
  const items: VisualMediaItem[] = [];
  const wikiEmbedPattern = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const markdownImagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;

  for (const match of line.matchAll(wikiEmbedPattern)) {
    const src = match[1]?.trim() ?? "";
    const size = parseSize(match[2] ?? "");
    const type = getMediaType(src);

    if (src && type) {
      items.push(createMediaItem({ src, type, width: size.width, alt: "" }));
    }
  }

  for (const match of line.matchAll(markdownImagePattern)) {
    const alt = match[1] ?? "";
    const rawSrc = match[2]?.trim() ?? "";
    const src = stripMarkdownTitle(rawSrc);
    const type = getMediaType(src);

    if (src && type) {
      items.push(createMediaItem({ src, type, alt }));
    }
  }

  return items;
}

function createMediaItem(options: {
  src: string;
  type: MediaType;
  alt?: string;
  width?: number;
}): VisualMediaItem {
  return {
    id: "item",
    type: options.type,
    src: options.src,
    sourceType: getSourceType(options.src),
    alt: options.alt ?? "",
    align: "center",
    width: options.width ?? DEFAULT_WIDTH,
    fit: "contain",
  };
}

function getPreferredRowHeight(items: VisualMediaItem[]): number {
  return items.length > 0 ? DEFAULT_ROW_HEIGHT : DEFAULT_ROW_HEIGHT;
}

function getMediaType(src: string, fallback?: unknown): MediaType | null {
  if (fallback === "image" || fallback === "video") {
    return fallback;
  }

  const extension = getExtension(src);
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  return null;
}

function getExtension(src: string): string {
  const withoutQuery = src.split(/[?#]/)[0] ?? src;
  const lastSegment = withoutQuery.split("/").pop() ?? withoutQuery;
  const dotIndex = lastSegment.lastIndexOf(".");
  return dotIndex >= 0 ? lastSegment.slice(dotIndex + 1).toLowerCase() : "";
}

function getSourceType(src: string, fallback?: unknown): MediaSourceType {
  if (fallback === "vault" || fallback === "url") {
    return fallback;
  }
  return /^https?:\/\//i.test(src) ? "url" : "vault";
}

function getAlign(value: unknown): MediaAlign {
  return value === "left" || value === "right" || value === "center" ? value : "center";
}

function getCaptionAlign(value: unknown): CaptionAlign {
  return value === "center" ? "center" : "left";
}

function getFitMode(value: unknown): MediaFitMode {
  return value === "cover" || value === "contain" ? value : "contain";
}

function getString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getOptionalPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function parseSize(sizeText: string): { width?: number; height?: number } {
  const trimmed = sizeText.trim();
  if (!trimmed) {
    return {};
  }

  const widthOnly = Number.parseInt(trimmed, 10);
  if (/^\d+$/.test(trimmed) && Number.isFinite(widthOnly)) {
    return { width: widthOnly };
  }

  const sizeMatch = trimmed.match(/^(\d+)x(\d+)$/i);
  if (!sizeMatch) {
    return {};
  }

  return {
    width: Number.parseInt(sizeMatch[1] ?? "", 10),
    height: Number.parseInt(sizeMatch[2] ?? "", 10),
  };
}

function stripMarkdownTitle(src: string): string {
  const titleMatch = src.match(/^([^"\s]+)(?:\s+["'][^"']*["'])?$/);
  return titleMatch?.[1] ?? src;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
