import { Plugin, type Editor } from "obsidian";

import {
  createLayoutFromItems,
  parseMarkdownMediaToLayout,
  parseVisualMediaLayout,
} from "./parser";
import { serializeVisualMediaLayoutBlock } from "./serializer";
import type { VisualMediaItem, VisualMediaLayout, VisualMediaRow } from "./types";

const AUTO_CONVERT_DELAY_MS = 250;
const AUTO_CONVERT_RETRY_DELAY_MS = 900;
const MAX_ITEMS_PER_ROW = 4;
const NEAR_CURSOR_SCAN_RADIUS = 40;

interface VisualLayoutBlock {
  startLine: number;
  endLine: number;
  layout: VisualMediaLayout;
}

const pendingEditors = new WeakMap<Editor, ReturnType<typeof setTimeout>[]>();
let isAutoConverting = false;

export function registerAutoConvert(plugin: Plugin, shouldAutoConvert: () => boolean = () => true): void {
  plugin.registerEvent(
    plugin.app.workspace.on("editor-change", (editor) => {
      if (isAutoConverting || !shouldAutoConvert()) {
        return;
      }

      const pending = pendingEditors.get(editor);
      if (pending) {
        pending.forEach((timeout) => clearTimeout(timeout));
      }

      const quickScan = setTimeout(() => {
        if (shouldAutoConvert()) {
          autoConvertCurrentMediaLine(editor);
        }
      }, AUTO_CONVERT_DELAY_MS);
      const slowScan = setTimeout(() => {
        pendingEditors.delete(editor);
        if (shouldAutoConvert()) {
          autoConvertCurrentMediaLine(editor);
        }
      }, AUTO_CONVERT_RETRY_DELAY_MS);

      pendingEditors.set(editor, [quickScan, slowScan]);
    }),
  );
}

function autoConvertCurrentMediaLine(editor: Editor): void {
  if (editor.somethingSelected()) {
    return;
  }

  if (splitTrailingTextAfterMedia(editor)) {
    return;
  }

  if (mergeAdjacentLayoutBlocks(editor)) {
    return;
  }

  const cursor = editor.getCursor();
  const mediaLine = findAutoConvertMediaLine(editor, cursor.line);
  if (mediaLine === null || isInsideCodeFence(editor, mediaLine)) {
    return;
  }

  const lineText = editor.getLine(mediaLine);
  const mediaLayout = parseMarkdownMediaToLayout(lineText);
  if (!mediaLayout || !isMediaOnlyMarkdown(lineText)) {
    return;
  }

  const items = mediaLayout.rows.flatMap((row) => row.items);
  const blockAbove = findVisualLayoutBlockAbove(editor, mediaLine);
  const blockBelow = blockAbove ? null : findVisualLayoutBlockBelow(editor, mediaLine);
  const nearbyBlock = blockAbove ?? blockBelow;

  isAutoConverting = true;
  try {
    if (nearbyBlock) {
      insertItemsIntoLayout(nearbyBlock.layout, items, blockBelow ? "start" : "end");
      replaceMediaLineAndBlock(editor, mediaLine, lineText, nearbyBlock);
      return;
    }

    replaceRangeWithLayoutBlock(
      editor,
      serializeVisualMediaLayoutBlock(createLayoutFromItems(items)),
      mediaLine,
      { line: mediaLine, ch: 0 },
      { line: mediaLine, ch: lineText.length },
    );
  } finally {
    isAutoConverting = false;
  }
}

function splitTrailingTextAfterMedia(editor: Editor): boolean {
  for (let line = 0; line < editor.lineCount(); line += 1) {
    if (isInsideCodeFence(editor, line)) {
      continue;
    }

    const lineText = editor.getLine(line);
    const split = splitMediaPrefix(lineText);
    if (!split) {
      continue;
    }

    isAutoConverting = true;
    try {
      editor.replaceRange(
        `${split.media}\n${split.rest}`,
        { line, ch: 0 },
        { line, ch: lineText.length },
      );
    } finally {
      isAutoConverting = false;
    }
    return true;
  }

  return false;
}

function splitMediaPrefix(lineText: string): { media: string; rest: string } | null {
  const trimmedStart = lineText.match(/^\s*/)?.[0] ?? "";
  const content = lineText.slice(trimmedStart.length);
  const wikiMatch = content.match(/^!\[\[[^\]]+\]\]/);
  const markdownMatch = content.match(/^!\[[^\]]*]\([^)]+\)/);
  const media = wikiMatch?.[0] ?? markdownMatch?.[0];

  if (!media) {
    return null;
  }

  const rest = content.slice(media.length).trimStart();
  if (!rest) {
    return null;
  }

  return {
    media: `${trimmedStart}${media}`,
    rest,
  };
}

function mergeAdjacentLayoutBlocks(editor: Editor): boolean {
  const firstBlock = findFirstAdjacentLayoutBlockPair(editor);
  if (!firstBlock) {
    return false;
  }

  const { previous, next } = firstBlock;
  const mergedLayout: VisualMediaLayout = {
    version: 1,
    rows: [...previous.layout.rows, ...next.layout.rows],
  };
  rebalanceRows(mergedLayout);

  isAutoConverting = true;
  try {
    replaceRangeWithLayoutBlock(
      editor,
      serializeVisualMediaLayoutBlock(mergedLayout),
      previous.startLine,
      { line: previous.startLine, ch: 0 },
      { line: next.endLine, ch: editor.getLine(next.endLine).length },
    );
  } finally {
    isAutoConverting = false;
  }

  return true;
}

function findFirstAdjacentLayoutBlockPair(
  editor: Editor,
): { previous: VisualLayoutBlock; next: VisualLayoutBlock } | null {
  let previousBlock: VisualLayoutBlock | null = null;

  for (let line = 0; line < editor.lineCount(); line += 1) {
    if (editor.getLine(line).trim() !== "```visual-media-layout") {
      continue;
    }

    const currentBlock = findVisualLayoutBlockStartingAt(editor, line);
    if (!currentBlock) {
      continue;
    }

    if (previousBlock && areBlocksAdjacent(editor, previousBlock, currentBlock)) {
      return {
        previous: previousBlock,
        next: currentBlock,
      };
    }

    previousBlock = currentBlock;
    line = currentBlock.endLine;
  }

  return null;
}

function areBlocksAdjacent(
  editor: Editor,
  previous: VisualLayoutBlock,
  next: VisualLayoutBlock,
): boolean {
  for (let line = previous.endLine + 1; line < next.startLine; line += 1) {
    if (editor.getLine(line).trim() !== "") {
      return false;
    }
  }

  return true;
}

function findAutoConvertMediaLine(editor: Editor, cursorLine: number): number | null {
  const adjacentToLayout = findMediaLineAdjacentToAnyLayout(editor);
  if (adjacentToLayout !== null) {
    return adjacentToLayout;
  }

  return findNearestMediaOnlyLine(editor, cursorLine);
}

function findNearestMediaOnlyLine(editor: Editor, cursorLine: number): number | null {
  for (let distance = 0; distance <= NEAR_CURSOR_SCAN_RADIUS; distance += 1) {
    const candidates = distance === 0
      ? [cursorLine]
      : [cursorLine - distance, cursorLine + distance];

    for (const line of candidates) {
      if (line < 0 || line >= editor.lineCount() || isInsideCodeFence(editor, line)) {
        continue;
      }

      const lineText = editor.getLine(line);
      if (isMediaOnlyMarkdown(lineText)) {
        return line;
      }
    }
  }

  return null;
}

function findMediaLineAdjacentToAnyLayout(editor: Editor): number | null {
  for (let line = 0; line < editor.lineCount(); line += 1) {
    if (editor.getLine(line).trim() !== "```visual-media-layout") {
      continue;
    }

    const block = findVisualLayoutBlockStartingAt(editor, line);
    if (!block) {
      continue;
    }

    const below = findMediaOnlyLineAfter(editor, block.endLine);
    if (below !== null) {
      return below;
    }

    const above = findMediaOnlyLineBefore(editor, block.startLine);
    if (above !== null) {
      return above;
    }

    line = block.endLine;
  }

  return null;
}

function findMediaOnlyLineAfter(editor: Editor, line: number): number | null {
  let currentLine = line + 1;
  while (currentLine < editor.lineCount() && editor.getLine(currentLine).trim() === "") {
    currentLine += 1;
  }

  return currentLine < editor.lineCount() && isMediaOnlyMarkdown(editor.getLine(currentLine))
    ? currentLine
    : null;
}

function findMediaOnlyLineBefore(editor: Editor, line: number): number | null {
  let currentLine = line - 1;
  while (currentLine >= 0 && editor.getLine(currentLine).trim() === "") {
    currentLine -= 1;
  }

  return currentLine >= 0 && isMediaOnlyMarkdown(editor.getLine(currentLine))
    ? currentLine
    : null;
}

function isMediaOnlyMarkdown(markdown: string): boolean {
  const parsed = parseMarkdownMediaToLayout(markdown);
  if (!parsed) {
    return false;
  }

  const withoutWikiEmbeds = markdown.replace(/!\[\[[^\]]+\]\]/g, "");
  const withoutMarkdownEmbeds = withoutWikiEmbeds.replace(/!\[[^\]]*]\([^)]+\)/g, "");
  return withoutMarkdownEmbeds.trim().length === 0;
}

function findVisualLayoutBlockAbove(editor: Editor, mediaLine: number): VisualLayoutBlock | null {
  let endLine = mediaLine - 1;
  while (endLine >= 0 && editor.getLine(endLine).trim() === "") {
    endLine -= 1;
  }

  if (endLine < 0 || editor.getLine(endLine).trim() !== "```") {
    return null;
  }

  return findVisualLayoutBlockEndingAt(editor, endLine);
}

function findVisualLayoutBlockBelow(editor: Editor, mediaLine: number): VisualLayoutBlock | null {
  let startLine = mediaLine + 1;
  while (startLine < editor.lineCount() && editor.getLine(startLine).trim() === "") {
    startLine += 1;
  }

  if (startLine >= editor.lineCount() || editor.getLine(startLine).trim() !== "```visual-media-layout") {
    return null;
  }

  return findVisualLayoutBlockStartingAt(editor, startLine);
}

function findVisualLayoutBlockEndingAt(editor: Editor, endLine: number): VisualLayoutBlock | null {
  for (let line = endLine - 1; line >= 0; line -= 1) {
    if (editor.getLine(line).trim() !== "```visual-media-layout") {
      continue;
    }

    return parseVisualLayoutBlock(editor, line, endLine);
  }

  return null;
}

function findVisualLayoutBlockStartingAt(editor: Editor, startLine: number): VisualLayoutBlock | null {
  for (let line = startLine + 1; line < editor.lineCount(); line += 1) {
    if (editor.getLine(line).trim() !== "```") {
      continue;
    }

    return parseVisualLayoutBlock(editor, startLine, line);
  }

  return null;
}

function parseVisualLayoutBlock(
  editor: Editor,
  startLine: number,
  endLine: number,
): VisualLayoutBlock | null {
  const source = editor.getRange(
    { line: startLine + 1, ch: 0 },
    { line: endLine, ch: 0 },
  ).trim();
  const layout = parseVisualMediaLayout(source);

  return layout
    ? {
      startLine,
      endLine,
      layout,
    }
    : null;
}

function replaceMediaLineAndBlock(
  editor: Editor,
  mediaLine: number,
  lineText: string,
  block: VisualLayoutBlock,
): void {
  const replacement = serializeVisualMediaLayoutBlock(block.layout);

  if (block.startLine < mediaLine) {
    replaceRangeWithLayoutBlock(
      editor,
      replacement,
      block.startLine,
      { line: block.startLine, ch: 0 },
      { line: mediaLine, ch: lineText.length },
    );
    return;
  }

  replaceRangeWithLayoutBlock(
    editor,
    replacement,
    mediaLine,
    { line: mediaLine, ch: 0 },
    { line: block.endLine, ch: editor.getLine(block.endLine).length },
  );
}

function replaceRangeWithLayoutBlock(
  editor: Editor,
  block: string,
  startLine: number,
  from: { line: number; ch: number },
  to: { line: number; ch: number },
): void {
  editor.replaceRange(`${block}\n`, from, to);
  moveCursorAfterBlock(editor, startLine, block);
}

function moveCursorAfterBlock(editor: Editor, startLine: number, block: string): void {
  const nextLine = startLine + block.split("\n").length;
  editor.setCursor({ line: Math.min(nextLine, editor.lastLine()), ch: 0 });
}

function insertItemsIntoLayout(
  layout: VisualMediaLayout,
  items: VisualMediaItem[],
  placement: "start" | "end",
): void {
  const itemIds = new Set(layout.rows.flatMap((row) => row.items.map((item) => item.id)));
  const freshItems = items.map((item, index) => ({
    ...item,
    id: createUniqueItemId(itemIds, index),
  }));

  if (layout.rows.length === 0) {
    layout.rows.push({
      id: `row-${Date.now()}`,
      align: "center",
      height: 220,
      items: [],
    });
  }

  if (placement === "start") {
    layout.rows[0]?.items.unshift(...freshItems);
  } else {
    layout.rows[layout.rows.length - 1]?.items.push(...freshItems);
  }
  rebalanceRows(layout);
}

function createUniqueItemId(existingIds: Set<string>, index: number): string {
  let id = `item-${Date.now()}-${index + 1}`;
  while (existingIds.has(id)) {
    id = `item-${Date.now()}-${Math.round(Math.random() * 100000)}`;
  }
  existingIds.add(id);
  return id;
}

function rebalanceRows(layout: VisualMediaLayout): void {
  for (let rowIndex = 0; rowIndex < layout.rows.length; rowIndex += 1) {
    const row = layout.rows[rowIndex];
    if (!row) {
      continue;
    }

    while (row.items.length > MAX_ITEMS_PER_ROW) {
      const overflowItem = row.items.pop();
      if (!overflowItem) {
        break;
      }

      let nextRow = layout.rows[rowIndex + 1];
      if (!nextRow) {
        nextRow = createOverflowRow(row);
        layout.rows.splice(rowIndex + 1, 0, nextRow);
      }
      nextRow.items.unshift(overflowItem);
    }
  }

  layout.rows = layout.rows.filter((row) => row.items.length > 0);
}

function createOverflowRow(sourceRow: VisualMediaRow): VisualMediaRow {
  return {
    id: `row-${Date.now()}`,
    align: sourceRow.align,
    height: sourceRow.height,
    items: [],
  };
}

function isInsideCodeFence(editor: Editor, line: number): boolean {
  let fenceCount = 0;

  for (let currentLine = 0; currentLine <= line; currentLine += 1) {
    if (editor.getLine(currentLine).trim().startsWith("```")) {
      fenceCount += 1;
    }
  }

  return fenceCount % 2 === 1;
}
