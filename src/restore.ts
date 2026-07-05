import type { App, TFile } from "obsidian";

import { parseVisualMediaLayout } from "./parser.ts";
import { NATIVE_FALLBACK_END, NATIVE_FALLBACK_START, serializeNativeMedia } from "./serializer.ts";

interface RestoreResult {
  content: string;
  count: number;
}

interface NativeFallbackBlock {
  endLine: number;
  mediaLines: string[];
}

export async function restoreCurrentNoteLayoutsToNativeMedia(app: App): Promise<number> {
  const file = app.workspace.getActiveFile();
  if (!file) {
    return 0;
  }

  return restoreFileLayoutsToNativeMedia(app, file);
}

export async function restoreVaultLayoutsToNativeMedia(app: App): Promise<number> {
  let restoredCount = 0;
  const files = app.vault.getMarkdownFiles();

  for (const file of files) {
    restoredCount += await restoreFileLayoutsToNativeMedia(app, file);
  }

  return restoredCount;
}

async function restoreFileLayoutsToNativeMedia(app: App, file: TFile): Promise<number> {
  const content = await app.vault.read(file);
  const restored = restoreLayoutsInContent(content);

  if (restored.count === 0 || restored.content === content) {
    return 0;
  }

  await app.vault.modify(file, restored.content);
  return restored.count;
}

export function restoreLayoutsInContent(content: string): RestoreResult {
  const lines = content.split("\n");
  const output: string[] = [];
  let restoredCount = 0;

  for (let line = 0; line < lines.length; line += 1) {
    if (lines[line]?.trim() !== "```visual-media-layout") {
      output.push(lines[line] ?? "");
      continue;
    }

    const endLine = findFenceEndLine(lines, line + 1);
    if (endLine === null) {
      output.push(lines[line] ?? "");
      continue;
    }

    const source = lines.slice(line + 1, endLine).join("\n").trim();
    const layout = parseVisualMediaLayout(source);
    if (!layout) {
      output.push(...lines.slice(line, endLine + 1));
      line = endLine;
      continue;
    }

    const nativeFallback = findNativeFallbackBlock(lines, endLine);
    const nativeMedia = nativeFallback?.mediaLines.join("\n").trim() || serializeNativeMedia(layout);
    if (nativeMedia) {
      output.push(...nativeMedia.split("\n"));
    }
    restoredCount += 1;
    line = nativeFallback?.endLine ?? endLine;
  }

  return {
    content: collapseExtraBlankLines(output.join("\n")),
    count: restoredCount,
  };
}

function findFenceEndLine(lines: string[], startLine: number): number | null {
  for (let line = startLine; line < lines.length; line += 1) {
    if (lines[line]?.trim() === "```") {
      return line;
    }
  }

  return null;
}

function findNativeFallbackBlock(lines: string[], codeBlockEndLine: number): NativeFallbackBlock | null {
  let line = codeBlockEndLine + 1;
  while (line < lines.length && lines[line]?.trim() === "") {
    line += 1;
  }

  if (lines[line]?.trim() !== NATIVE_FALLBACK_START) {
    return null;
  }

  for (let fallbackLine = line + 1; fallbackLine < lines.length; fallbackLine += 1) {
    if (lines[fallbackLine]?.trim() === NATIVE_FALLBACK_END) {
      return {
        endLine: fallbackLine,
        mediaLines: lines.slice(line + 1, fallbackLine),
      };
    }
  }

  return null;
}

function collapseExtraBlankLines(content: string): string {
  return content.replace(/\n{3,}/g, "\n\n");
}
