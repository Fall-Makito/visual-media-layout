import test from "node:test";
import assert from "node:assert/strict";

import {
  parseMarkdownMediaToLayout,
  parseVisualMediaLayout,
} from "../src/parser.ts";
import { restoreLayoutsInContent } from "../src/restore.ts";
import {
  NATIVE_FALLBACK_END,
  NATIVE_FALLBACK_START,
  serializeVisualMediaLayout,
  serializeVisualMediaLayoutBlock,
  serializeVisualMediaLayoutBlockWithFallback,
} from "../src/serializer.ts";

test("parses wiki image embed", () => {
  const layout = parseMarkdownMediaToLayout("![[cat.png]]");

  assert.equal(layout?.rows[0]?.items[0]?.src, "cat.png");
  assert.equal(layout?.rows[0]?.items[0]?.type, "image");
});

test("parses wiki image width", () => {
  const layout = parseMarkdownMediaToLayout("![[cat.png|300]]");

  assert.equal(layout?.rows[0]?.items[0]?.width, 300);
});

test("parses wiki image width and height text safely", () => {
  const layout = parseMarkdownMediaToLayout("![[cat.png|300x200]]");

  assert.equal(layout?.rows[0]?.items[0]?.width, 300);
});

test("parses wiki video embed", () => {
  const layout = parseMarkdownMediaToLayout("![[demo.mp4]]");

  assert.equal(layout?.rows[0]?.items[0]?.src, "demo.mp4");
  assert.equal(layout?.rows[0]?.items[0]?.type, "video");
});

test("parses markdown image with alt text", () => {
  const layout = parseMarkdownMediaToLayout("![alt](images/cat.png)");

  assert.equal(layout?.rows[0]?.items[0]?.src, "images/cat.png");
  assert.equal(layout?.rows[0]?.items[0]?.alt, "alt");
  assert.equal(layout?.rows[0]?.items[0]?.type, "image");
});

test("parses markdown video with empty alt text", () => {
  const layout = parseMarkdownMediaToLayout("![](images/demo.mp4)");

  assert.equal(layout?.rows[0]?.items[0]?.src, "images/demo.mp4");
  assert.equal(layout?.rows[0]?.items[0]?.type, "video");
});

test("converts multiple media lines into one layout", () => {
  const layout = parseMarkdownMediaToLayout(["![[cat.png]]", "![[demo.mp4]]"].join("\n"));

  assert.equal(layout?.rows.length, 1);
  assert.equal(layout?.rows[0]?.items.length, 2);
});

test("splits more than four media items into another row", () => {
  const layout = parseMarkdownMediaToLayout(
    ["![[1.png]]", "![[2.png]]", "![[3.png]]", "![[4.png]]", "![[5.png]]"].join("\n"),
  );

  assert.equal(layout?.rows.length, 2);
  assert.equal(layout?.rows[0]?.items.length, 4);
  assert.equal(layout?.rows[1]?.items.length, 1);
});

test("normalizes layout JSON so a row never has more than four media items", () => {
  const layout = parseVisualMediaLayout(`{
    "version": 1,
    "rows": [
      {
        "id": "row-1",
        "align": "center",
        "height": 220,
        "items": [
          { "id": "item-1", "type": "image", "src": "1.png", "sourceType": "vault", "alt": "", "align": "center", "width": 360, "fit": "contain" },
          { "id": "item-2", "type": "image", "src": "2.png", "sourceType": "vault", "alt": "", "align": "center", "width": 360, "fit": "contain" },
          { "id": "item-3", "type": "image", "src": "3.png", "sourceType": "vault", "alt": "", "align": "center", "width": 360, "fit": "contain" },
          { "id": "item-4", "type": "image", "src": "4.png", "sourceType": "vault", "alt": "", "align": "center", "width": 360, "fit": "contain" },
          { "id": "item-5", "type": "image", "src": "5.png", "sourceType": "vault", "alt": "", "align": "center", "width": 360, "fit": "contain" }
        ]
      }
    ]
  }`);

  assert.equal(layout?.rows.length, 2);
  assert.equal(layout?.rows[0]?.items.length, 4);
  assert.equal(layout?.rows[1]?.items.length, 1);
});

test("invalid layout JSON returns null instead of throwing", () => {
  assert.equal(parseVisualMediaLayout("{ bad json"), null);
});

test("normalizes duplicate row and media ids", () => {
  const layout = parseVisualMediaLayout(`{
    "version": 1,
    "rows": [
      {
        "id": "row-1",
        "align": "center",
        "height": 220,
        "items": [
          { "id": "item-1", "type": "image", "src": "1.png", "sourceType": "vault", "alt": "", "align": "center", "width": 360, "fit": "contain" }
        ]
      },
      {
        "id": "row-1",
        "align": "center",
        "height": 220,
        "items": [
          { "id": "item-1", "type": "image", "src": "2.png", "sourceType": "vault", "alt": "", "align": "center", "width": 360, "fit": "contain" }
        ]
      }
    ]
  }`);

  assert.notEqual(layout?.rows[0]?.id, layout?.rows[1]?.id);
  assert.notEqual(layout?.rows[0]?.items[0]?.id, layout?.rows[1]?.items[0]?.id);
});

test("normalizes optional media caption", () => {
  const layout = parseVisualMediaLayout(`{
    "version": 1,
    "rows": [
      {
        "id": "row-1",
        "align": "center",
        "height": 220,
        "items": [
          { "id": "item-1", "type": "image", "src": "1.png", "sourceType": "vault", "alt": "", "caption": "hello", "captionAlign": "center", "align": "center", "width": 360, "fit": "contain" }
        ]
      }
    ]
  }`);

  assert.equal(layout?.rows[0]?.items[0]?.caption, "hello");
  assert.equal(layout?.rows[0]?.items[0]?.captionAlign, "center");
});

test("normalizes optional media aspect ratio", () => {
  const layout = parseVisualMediaLayout(`{
    "version": 1,
    "rows": [
      {
        "id": "row-1",
        "align": "center",
        "height": 220,
        "items": [
          { "id": "item-1", "type": "image", "src": "1.png", "sourceType": "vault", "alt": "", "align": "center", "width": 360, "aspectRatio": 1.5, "fit": "contain" }
        ]
      }
    ]
  }`);

  assert.equal(layout?.rows[0]?.items[0]?.aspectRatio, 1.5);
});

test("serializer uses two-space indentation", () => {
  const layout = parseMarkdownMediaToLayout("![[cat.png]]");
  assert.ok(layout);

  const serialized = serializeVisualMediaLayout(layout);

  assert.match(serialized, /\n  "version": 1,/);
});

test("serializer can create a visual-media-layout code block", () => {
  const layout = parseMarkdownMediaToLayout(["![[cat.png]]", "![[demo.mp4]]"].join("\n"));
  assert.ok(layout);

  const block = serializeVisualMediaLayoutBlock(layout);

  assert.match(block, /^```visual-media-layout\n/);
  assert.match(block, /\n```$/);
  assert.match(block, /"src": "cat.png"/);
  assert.match(block, /"src": "demo.mp4"/);
});

test("serializer can append a native media fallback", () => {
  const layout = parseMarkdownMediaToLayout(["![[cat.png]]", "![[demo.mp4]]"].join("\n"));
  assert.ok(layout);
  layout.nativeFallback = true;

  const block = serializeVisualMediaLayoutBlockWithFallback(layout);

  assert.match(block, new RegExp(NATIVE_FALLBACK_START));
  assert.match(block, /!\[\[cat\.png\]\]/);
  assert.match(block, /!\[\[demo\.mp4\]\]/);
  assert.match(block, new RegExp(NATIVE_FALLBACK_END));
});

test("restores visual media layout blocks to native media", () => {
  const layout = parseMarkdownMediaToLayout(["![[cat.png]]", "![[demo.mp4]]"].join("\n"));
  assert.ok(layout);
  const content = [
    "# Note",
    serializeVisualMediaLayoutBlock(layout),
    "",
    NATIVE_FALLBACK_START,
    "![[cat.png]]",
    "![[demo.mp4]]",
    NATIVE_FALLBACK_END,
  ].join("\n");

  const restored = restoreLayoutsInContent(content);

  assert.equal(restored.count, 1);
  assert.doesNotMatch(restored.content, /```visual-media-layout/);
  assert.doesNotMatch(restored.content, new RegExp(NATIVE_FALLBACK_START));
  assert.match(restored.content, /!\[\[cat\.png\]\]/);
  assert.match(restored.content, /!\[\[demo\.mp4\]\]/);
});
