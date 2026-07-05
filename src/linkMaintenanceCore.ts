import { parseVisualMediaLayout } from "./parser.ts";
import { serializeVisualMediaLayoutBlock } from "./serializer.ts";
import type { VisualMediaItem, VisualMediaLayout } from "./types.ts";

const VISUAL_MEDIA_LAYOUT_FENCE_START = "```visual-media-layout";
const VISUAL_MEDIA_LAYOUT_FENCE_END = "```";

export interface LinkMaintenanceResult {
  content: string;
  updatedLayoutCount: number;
  updatedItemCount: number;
  ambiguousItemCount: number;
  unresolvedItemCount: number;
}

export interface RepairBrokenMediaLinksOptions {
  findCandidatePaths: (src: string) => string[];
  resolveExistingPath: (src: string) => string | null;
}

interface RewriteLayoutResult {
  updatedItemCount: number;
  ambiguousItemCount?: number;
  unresolvedItemCount?: number;
}

type RewriteLayout = (layout: VisualMediaLayout) => RewriteLayoutResult;

export function updateRenamedMediaLinksInContent(
  content: string,
  oldPath: string,
  newPath: string,
): LinkMaintenanceResult {
  return rewriteVisualMediaLayoutBlocks(content, (layout) => {
    let updatedItemCount = 0;

    for (const item of getVaultMediaItems(layout)) {
      const nextSrc = getRenamedMediaSrc(item.src, oldPath, newPath);
      if (!nextSrc || nextSrc === item.src) {
        continue;
      }

      item.src = nextSrc;
      item.sourceType = "vault";
      updatedItemCount += 1;
    }

    return { updatedItemCount };
  });
}

export function repairBrokenMediaLinksInContent(
  content: string,
  options: RepairBrokenMediaLinksOptions,
): LinkMaintenanceResult {
  return rewriteVisualMediaLayoutBlocks(content, (layout) => {
    let updatedItemCount = 0;
    let ambiguousItemCount = 0;
    let unresolvedItemCount = 0;

    for (const item of getVaultMediaItems(layout)) {
      if (options.resolveExistingPath(item.src)) {
        continue;
      }

      const candidates = getUniqueCandidatePaths(options.findCandidatePaths(item.src));
      if (candidates.length === 1) {
        const nextSrc = candidates[0];
        if (nextSrc && nextSrc !== item.src) {
          item.src = nextSrc;
          item.sourceType = "vault";
          updatedItemCount += 1;
        }
        continue;
      }

      if (candidates.length > 1) {
        ambiguousItemCount += 1;
      } else {
        unresolvedItemCount += 1;
      }
    }

    return {
      updatedItemCount,
      ambiguousItemCount,
      unresolvedItemCount,
    };
  });
}

function rewriteVisualMediaLayoutBlocks(
  content: string,
  rewriteLayout: RewriteLayout,
): LinkMaintenanceResult {
  const lines = content.split("\n");
  const output: string[] = [];
  let updatedLayoutCount = 0;
  let updatedItemCount = 0;
  let ambiguousItemCount = 0;
  let unresolvedItemCount = 0;

  for (let line = 0; line < lines.length; line += 1) {
    if (lines[line]?.trim() !== VISUAL_MEDIA_LAYOUT_FENCE_START) {
      output.push(lines[line] ?? "");
      continue;
    }

    const endLine = findFenceEndLine(lines, line + 1);
    if (endLine === null) {
      output.push(lines[line] ?? "");
      continue;
    }

    const originalBlockLines = lines.slice(line, endLine + 1);
    const source = lines.slice(line + 1, endLine).join("\n").trim();
    const layout = parseVisualMediaLayout(source);
    if (!layout) {
      output.push(...originalBlockLines);
      line = endLine;
      continue;
    }

    const result = rewriteLayout(layout);
    updatedItemCount += result.updatedItemCount;
    ambiguousItemCount += result.ambiguousItemCount ?? 0;
    unresolvedItemCount += result.unresolvedItemCount ?? 0;

    if (result.updatedItemCount > 0) {
      updatedLayoutCount += 1;
      output.push(...serializeVisualMediaLayoutBlock(layout).split("\n"));
    } else {
      output.push(...originalBlockLines);
    }

    line = endLine;
  }

  return {
    content: output.join("\n"),
    updatedLayoutCount,
    updatedItemCount,
    ambiguousItemCount,
    unresolvedItemCount,
  };
}

function getVaultMediaItems(layout: VisualMediaLayout): VisualMediaItem[] {
  return layout.rows.flatMap((row) => row.items).filter((item) => item.sourceType !== "url" && !isRemoteUrl(item.src));
}

function getRenamedMediaSrc(src: string, oldPath: string, newPath: string): string | null {
  const normalizedSrc = normalizeVaultPath(src);
  const normalizedOldPath = normalizeVaultPath(oldPath);
  const normalizedNewPath = normalizeVaultPath(newPath);

  if (normalizedSrc === normalizedOldPath) {
    return normalizedNewPath;
  }

  const oldBasename = getPathBasename(normalizedOldPath);
  if (normalizedSrc === oldBasename) {
    return normalizedNewPath;
  }

  return null;
}

function getUniqueCandidatePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map((path) => normalizeVaultPath(path)).filter(Boolean)));
}

function findFenceEndLine(lines: string[], startLine: number): number | null {
  for (let line = startLine; line < lines.length; line += 1) {
    if (lines[line]?.trim() === VISUAL_MEDIA_LAYOUT_FENCE_END) {
      return line;
    }
  }

  return null;
}

function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function getPathBasename(path: string): string {
  const cleanPath = path.split(/[?#]/)[0] ?? path;
  return cleanPath.split("/").filter(Boolean).pop() ?? cleanPath;
}

function isRemoteUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}
