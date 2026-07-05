import test from "node:test";
import assert from "node:assert/strict";

import {
  repairBrokenMediaLinksInContent,
  updateRenamedMediaLinksInContent,
} from "../src/linkMaintenanceCore.ts";

test("updates exact vault media paths in visual media layout blocks", () => {
  const content = createLayoutContent("images/cat.png");

  const result = updateRenamedMediaLinksInContent(content, "images/cat.png", "assets/cat-renamed.png");

  assert.equal(result.updatedLayoutCount, 1);
  assert.equal(result.updatedItemCount, 1);
  assert.match(result.content, /"src": "assets\/cat-renamed\.png"/);
  assert.doesNotMatch(result.content, /"src": "images\/cat\.png"/);
});

test("updates filename-only media srcs when the renamed file was stored without its folder", () => {
  const content = createLayoutContent("cat.png");

  const result = updateRenamedMediaLinksInContent(content, "images/cat.png", "assets/cat-renamed.png");

  assert.equal(result.updatedItemCount, 1);
  assert.match(result.content, /"src": "assets\/cat-renamed\.png"/);
});

test("does not update remote media urls", () => {
  const content = createLayoutContent("https://example.com/cat.png", "url");

  const result = updateRenamedMediaLinksInContent(content, "cat.png", "assets/cat-renamed.png");

  assert.equal(result.updatedItemCount, 0);
  assert.equal(result.content, content);
});

test("repairs a broken moved media link when exactly one candidate has the same filename", () => {
  const content = createLayoutContent("old/cat.png");

  const result = repairBrokenMediaLinksInContent(content, {
    findCandidatePaths: () => ["new/cat.png"],
    resolveExistingPath: () => null,
  });

  assert.equal(result.updatedItemCount, 1);
  assert.equal(result.ambiguousItemCount, 0);
  assert.equal(result.unresolvedItemCount, 0);
  assert.match(result.content, /"src": "new\/cat\.png"/);
});

test("leaves a broken media link unchanged when repair candidates are ambiguous", () => {
  const content = createLayoutContent("old/cat.png");

  const result = repairBrokenMediaLinksInContent(content, {
    findCandidatePaths: () => ["new/cat.png", "archive/cat.png"],
    resolveExistingPath: () => null,
  });

  assert.equal(result.updatedItemCount, 0);
  assert.equal(result.ambiguousItemCount, 1);
  assert.equal(result.unresolvedItemCount, 0);
  assert.equal(result.content, content);
});

test("preserves nativeFallback when rewriting a layout block", () => {
  const content = [
    "```visual-media-layout",
    "{",
    '  "version": 1,',
    '  "nativeFallback": true,',
    '  "rows": [',
    "    {",
    '      "id": "row-1",',
    '      "align": "center",',
    '      "height": 220,',
    '      "items": [',
    '        { "id": "item-1", "type": "image", "src": "images/cat.png", "sourceType": "vault", "alt": "", "align": "center", "width": 360, "fit": "contain" }',
    "      ]",
    "    }",
    "  ]",
    "}",
    "```",
  ].join("\n");

  const result = updateRenamedMediaLinksInContent(content, "images/cat.png", "assets/cat.png");

  assert.match(result.content, /"nativeFallback": true/);
  assert.match(result.content, /"src": "assets\/cat\.png"/);
});

function createLayoutContent(src: string, sourceType: "vault" | "url" = "vault"): string {
  return [
    "```visual-media-layout",
    "{",
    '  "version": 1,',
    '  "rows": [',
    "    {",
    '      "id": "row-1",',
    '      "align": "center",',
    '      "height": 220,',
    '      "items": [',
    `        { "id": "item-1", "type": "image", "src": "${src}", "sourceType": "${sourceType}", "alt": "", "align": "center", "width": 360, "fit": "contain" }`,
    "      ]",
    "    }",
    "  ]",
    "}",
    "```",
  ].join("\n");
}
