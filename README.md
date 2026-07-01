# Visual Media Layout

Visual Media Layout is an Obsidian plugin for arranging images and videos in visual layout blocks.

It is designed for people who want richer media layouts in notes without manually editing complex HTML.

## What It Does

- Arranges images and videos into visual rows.
- Supports 1, 2, 3, or 4 columns per row.
- Keeps media in the same row at the same height.
- Splits the fifth media item into a new row automatically.
- Displays vault images, web images, vault videos, and web videos.
- Converts selected Markdown media embeds into a layout block.
- Converts a current media line into a layout block.
- Can automatically convert media-only lines.
- Can append newly inserted media to a nearby layout block.
- Can merge adjacent Visual Media Layout blocks.
- Supports right-click alignment actions.
- Supports Delete and Backspace for selected media items.
- Supports drag reordering and column splitting.
- Supports bottom-right resize and column boundary resize.
- Works in Reading View and has a usable Live Preview renderer.

Reading View is currently the most reliable mode for drag-heavy editing.

## Installation

### Install From GitHub Releases

GitHub Releases is the official distribution path for this plugin.

1. Open the GitHub Releases page for this plugin.
2. Download these files from the latest release:
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. In your vault, create this folder:

```text
YourVault/.obsidian/plugins/visual-media-layout
```

4. Put the three downloaded files into that folder.
5. Restart Obsidian.
6. Go to Settings, Community plugins, and enable Visual Media Layout.

Do not install this plugin from cloud drive links, chat attachments, reposted zip files, or third-party mirrors.

## Development

Install dependencies:

```bash
npm install
```

Build the plugin:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Prepare release files:

```bash
npm run release
```

The release command creates:

```text
dist/visual-media-layout/main.js
dist/visual-media-layout/manifest.json
dist/visual-media-layout/styles.css
dist/visual-media-layout/sha256sums.txt
```

Upload `main.js`, `manifest.json`, and `styles.css` to the GitHub Release.

## Test In Obsidian

After building, copy this folder into your test vault:

```text
YourTestVault/.obsidian/plugins/visual-media-layout
```

Then open Obsidian, go to Settings, Community plugins, reload plugins, and enable Visual Media Layout.

Create a note and paste this test block:

````markdown
```visual-media-layout
{
  "version": 1,
  "rows": [
    {
      "id": "row-1",
      "align": "center",
      "height": 220,
      "items": [
        {
          "id": "item-1",
          "type": "image",
          "src": "cat.png",
          "sourceType": "vault",
          "alt": "",
          "align": "center",
          "width": 360,
          "fit": "contain"
        },
        {
          "id": "item-2",
          "type": "video",
          "src": "demo.mp4",
          "sourceType": "vault",
          "alt": "",
          "align": "center",
          "width": 360,
          "fit": "contain"
        }
      ]
    }
  ]
}
```
````

For this exact block to show real media, put files named `cat.png` and `demo.mp4` in the same vault. You can also edit the `src` values to match media files that already exist in your vault.

Switch to Reading View. You should see one row with two media cards. If the files exist, the image should display and the video should show playback controls. If a file is missing, you will see a friendly "not found" card.

## Useful Checks

- Four media items in one row should display as four columns.
- Five media items in one row should move the fifth item into a second row.
- Right-click alignment should save back to the Markdown block.
- Delete or Backspace should remove the selected media item.
- Resizing from the bottom-right handle should save width or height.
- Dragging a boundary between two media items should update neighboring widths.
- Dragging media left or right of another media item should reorder the layout.
- Converting selected Markdown media should replace the selected text with a layout block.
- Live Preview should render the layout in place.

## Privacy

Visual Media Layout works inside your Obsidian vault. It does not intentionally collect, sell, or upload personal information.

If a note references web images or web videos, Obsidian may request those URLs so the media can be displayed.

## Security

Official releases should be downloaded only from:

- This project's GitHub Releases page

Security issues should be reported privately. See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
