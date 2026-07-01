import { Notice, Plugin, type Editor } from "obsidian";

import { createEmptyVisualMediaLayout, parseMarkdownMediaToLayout } from "./parser";
import { restoreCurrentNoteLayoutsToNativeMedia, restoreVaultLayoutsToNativeMedia } from "./restore";
import { serializeVisualMediaLayoutBlock } from "./serializer";

interface VisualMediaCommandActions {
  disableAutoConvert: () => Promise<void>;
  enableAutoConvert: () => Promise<void>;
}

export function registerVisualMediaCommands(plugin: Plugin, actions: VisualMediaCommandActions): void {
  plugin.addCommand({
    id: "insert-empty-layout",
    name: "Insert empty layout",
    editorCallback: (editor) => {
      insertEmptyLayoutBlock(editor);
    },
  });

  plugin.registerEvent(
    plugin.app.workspace.on("editor-menu", (menu, editor) => {
      menu.addItem((item) => {
        item
          .setTitle("插入布局区")
          .setIcon("layout-panel-top")
          .setSection("insert")
          .onClick(() => {
            insertEmptyLayoutBlock(editor);
          });
      });
    }),
  );

  plugin.addCommand({
    id: "convert-selected-media-to-layout",
    name: "Convert selected media to layout",
    editorCallback: (editor) => {
      const selection = editor.getSelection();
      if (!selection.trim()) {
        new Notice("Visual Media Layout: select one or more media lines first.");
        return;
      }

      const layout = parseMarkdownMediaToLayout(selection);
      if (!layout) {
        new Notice("Visual Media Layout: no supported image or video embeds found in selection.");
        return;
      }

      replaceSelectionWithLayoutBlock(editor, serializeVisualMediaLayoutBlock(layout));
      new Notice("Visual Media Layout: selected media converted.");
    },
  });

  plugin.addCommand({
    id: "convert-current-media-line-to-layout",
    name: "Convert current media line to layout",
    editorCallback: (editor) => {
      const cursor = editor.getCursor();
      const lineText = editor.getLine(cursor.line);
      const layout = parseMarkdownMediaToLayout(lineText);

      if (!layout) {
        new Notice("Visual Media Layout: current line does not contain supported media.");
        return;
      }

      replaceRangeWithLayoutBlock(
        editor,
        serializeVisualMediaLayoutBlock(layout),
        cursor.line,
        { line: cursor.line, ch: 0 },
        { line: cursor.line, ch: lineText.length },
      );
      new Notice("Visual Media Layout: current media line converted.");
    },
  });

  plugin.addCommand({
    id: "restore-current-note-layouts-to-native-media",
    name: "Restore current note layouts to normal media",
    callback: () => {
      void restoreCurrentNoteLayouts(plugin, actions);
    },
  });

  plugin.addCommand({
    id: "restore-vault-layouts-to-native-media",
    name: "Restore all vault layouts to normal media",
    callback: () => {
      void restoreVaultLayouts(plugin, actions);
    },
  });

  plugin.addCommand({
    id: "enable-auto-convert",
    name: "Enable automatic media layout conversion",
    callback: () => {
      void actions.enableAutoConvert().then(() => {
        new Notice("Visual Media Layout: automatic conversion enabled.");
      });
    },
  });
}

function insertEmptyLayoutBlock(editor: Editor): void {
  insertLayoutBlock(editor, serializeVisualMediaLayoutBlock(createEmptyVisualMediaLayout()));
  new Notice("Visual Media Layout: empty layout inserted.");
}

function insertLayoutBlock(editor: Editor, block: string): void {
  const selection = editor.getSelection();
  const prefix = selection.length > 0 || isCursorAtLineStart(editor) ? "" : "\n\n";
  const insertion = `${prefix}${block}\n`;
  const startLine = editor.getCursor("from").line + prefix.split("\n").length - 1;
  editor.replaceSelection(insertion);
  moveCursorAfterBlock(editor, startLine, block);
}

function replaceSelectionWithLayoutBlock(editor: Editor, block: string): void {
  const startLine = editor.getCursor("from").line;
  editor.replaceSelection(`${block}\n`);
  moveCursorAfterBlock(editor, startLine, block);
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

function isCursorAtLineStart(editor: Editor): boolean {
  return editor.getCursor().ch === 0;
}

async function restoreCurrentNoteLayouts(
  plugin: Plugin,
  actions: VisualMediaCommandActions,
): Promise<void> {
  await actions.disableAutoConvert();
  const count = await restoreCurrentNoteLayoutsToNativeMedia(plugin.app);
  new Notice(`Visual Media Layout: restored ${count} layout block(s). Automatic conversion is now disabled.`);
}

async function restoreVaultLayouts(
  plugin: Plugin,
  actions: VisualMediaCommandActions,
): Promise<void> {
  const confirmed = window.confirm(
    "This will replace every Visual Media Layout block in this vault with normal Obsidian media embeds. Continue?",
  );
  if (!confirmed) {
    return;
  }

  await actions.disableAutoConvert();
  const count = await restoreVaultLayoutsToNativeMedia(plugin.app);
  new Notice(`Visual Media Layout: restored ${count} layout block(s) in this vault. Automatic conversion is now disabled.`);
}
