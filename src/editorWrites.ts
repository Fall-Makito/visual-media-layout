import { Notice, TFile, type App, type MarkdownPostProcessorContext } from "obsidian";

import {
  NATIVE_FALLBACK_END,
  NATIVE_FALLBACK_START,
  serializeVisualMediaLayoutBlockWithFallback,
} from "./serializer";
import type { VisualMediaLayout } from "./types";

export interface SaveVisualMediaLayoutOptions {
  app: App;
  context: MarkdownPostProcessorContext;
  containerEl: HTMLElement;
  layout: VisualMediaLayout;
  source: string;
}

export interface DeleteVisualMediaLayoutOptions {
  app: App;
  context: MarkdownPostProcessorContext;
  containerEl: HTMLElement;
  source: string;
}

export interface VisualMediaLayoutEdit {
  context: MarkdownPostProcessorContext;
  containerEl: HTMLElement;
  layout: VisualMediaLayout | null;
  source: string;
}

export interface SaveVisualMediaLayoutEditsOptions {
  app: App;
  edits: VisualMediaLayoutEdit[];
}

export async function saveVisualMediaLayout(options: SaveVisualMediaLayoutOptions): Promise<void> {
  await saveVisualMediaLayoutEdits({
    app: options.app,
    edits: [{
      context: options.context,
      containerEl: options.containerEl,
      layout: options.layout,
      source: options.source,
    }],
  });
}

export async function saveVisualMediaLayoutEdits(
  options: SaveVisualMediaLayoutEditsOptions,
): Promise<void> {
  try {
    const firstEdit = options.edits[0];
    if (!firstEdit) {
      return;
    }

    const file = options.app.vault.getAbstractFileByPath(firstEdit.context.sourcePath);
    if (!(file instanceof TFile) || options.edits.some((edit) => edit.context.sourcePath !== firstEdit.context.sourcePath)) {
      new Notice("Visual Media Layout: could not find this code block to save.");
      return;
    }

    const content = await options.app.vault.read(file);
    const sectionEdits = options.edits.map((edit) => ({
      edit,
      section: edit.context.getSectionInfo(edit.containerEl),
    }));

    if (sectionEdits.every(({ section }) => section)) {
      const lines = content.split("\n");
      const sortedEdits = sectionEdits
        .filter((entry): entry is typeof entry & { section: NonNullable<typeof entry.section> } => Boolean(entry.section))
        .sort((a, b) => b.section.lineStart - a.section.lineStart);

      for (const { edit, section } of sortedEdits) {
        const replacement = edit.layout ? serializeVisualMediaLayoutBlockWithFallback(edit.layout).split("\n") : [];
        const lineEnd = findNativeFallbackEndLine(lines, section.lineEnd) ?? section.lineEnd;
        lines.splice(section.lineStart, lineEnd - section.lineStart + 1, ...replacement);
      }

      await options.app.vault.modify(file, removeExtraBlankLines(lines.join("\n")));
      return;
    }

    let nextContent = content;
    for (const edit of options.edits) {
      const originalBlock = findOriginalBlock(nextContent, edit.source);

      if (!originalBlock) {
        new Notice("Visual Media Layout: could not locate this code block in Live Preview.");
        return;
      }

      const replacementBlock = edit.layout ? serializeVisualMediaLayoutBlockWithFallback(edit.layout) : "";
      const originalEnd = originalBlock.index + originalBlock.text.length;
      const fallbackAtStart = findNativeFallbackAtStart(nextContent.slice(originalEnd));
      const replaceEnd = originalEnd + (fallbackAtStart?.length ?? 0);
      nextContent = `${nextContent.slice(0, originalBlock.index)}${replacementBlock}${nextContent.slice(replaceEnd)}`;
    }

    await options.app.vault.modify(file, removeExtraBlankLines(nextContent));
  } catch (error) {
    console.error("Visual Media Layout: failed to save layout", error);
    new Notice("Visual Media Layout: failed to save this layout. Check the console for details.");
  }
}

export async function deleteVisualMediaLayoutBlock(
  options: DeleteVisualMediaLayoutOptions,
): Promise<void> {
  await saveVisualMediaLayoutEdits({
    app: options.app,
    edits: [{
      context: options.context,
      containerEl: options.containerEl,
      layout: null,
      source: options.source,
    }],
  });
}

function findOriginalBlock(content: string, source: string): { index: number; text: string } | null {
  const candidates = [
    ["```visual-media-layout", source, "```"].join("\n"),
    ["```visual-media-layout", source, "```"].join("\r\n"),
  ];

  for (const candidate of candidates) {
    const index = content.indexOf(candidate);
    if (index >= 0) {
      return {
        index,
        text: candidate,
      };
    }
  }

  return null;
}

function findNativeFallbackEndLine(lines: string[], codeBlockEndLine: number): number | null {
  let currentLine = codeBlockEndLine + 1;
  while (currentLine < lines.length && lines[currentLine]?.trim() === "") {
    currentLine += 1;
  }

  if (lines[currentLine]?.trim() !== NATIVE_FALLBACK_START) {
    return null;
  }

  for (let line = currentLine + 1; line < lines.length; line += 1) {
    if (lines[line]?.trim() === NATIVE_FALLBACK_END) {
      return line;
    }
  }

  return null;
}

function findNativeFallbackAtStart(content: string): { length: number } | null {
  const newline = String.raw`(?:\r?\n)`;
  const escapedStart = escapeRegExp(NATIVE_FALLBACK_START);
  const escapedEnd = escapeRegExp(NATIVE_FALLBACK_END);
  const match = content.match(new RegExp(`^(?:${newline}){0,2}${escapedStart}[\\s\\S]*?${escapedEnd}`));
  return match ? { length: match[0].length } : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeExtraBlankLines(content: string): string {
  return content.replace(/\n{3,}/g, "\n\n");
}
