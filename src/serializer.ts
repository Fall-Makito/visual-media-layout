import type { VisualMediaLayout } from "./types";

export const NATIVE_FALLBACK_START = '<span class="visual-media-layout-fallback-start"></span>';
export const NATIVE_FALLBACK_END = '<span class="visual-media-layout-fallback-end"></span>';

export function serializeVisualMediaLayout(layout: VisualMediaLayout): string {
  return JSON.stringify(layout, null, 2);
}

export function serializeVisualMediaLayoutBlock(layout: VisualMediaLayout): string {
  return ["```visual-media-layout", serializeVisualMediaLayout(layout), "```"].join("\n");
}

export function serializeVisualMediaLayoutBlockWithFallback(layout: VisualMediaLayout): string {
  const block = serializeVisualMediaLayoutBlock(layout);
  return layout.nativeFallback ? [block, serializeNativeFallback(layout)].join("\n\n") : block;
}

export function serializeNativeMedia(layout: VisualMediaLayout): string {
  return layout.rows.flatMap((row) => row.items.flatMap((item) => {
    const mediaLine = item.sourceType === "url"
      ? `![${escapeMarkdownAlt(item.alt)}](${item.src})`
      : `![[${item.src}]]`;

    return item.caption ? [mediaLine, item.caption] : [mediaLine];
  })).join("\n");
}

export function serializeNativeFallback(layout: VisualMediaLayout): string {
  const nativeMedia = serializeNativeMedia(layout);
  return nativeMedia
    ? [NATIVE_FALLBACK_START, nativeMedia, NATIVE_FALLBACK_END].join("\n")
    : [NATIVE_FALLBACK_START, NATIVE_FALLBACK_END].join("\n");
}

function escapeMarkdownAlt(value: string): string {
  return value.replace(/]/g, "\\]");
}
