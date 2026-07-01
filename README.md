# Visual Media Layout 插件

Visual Media Layout 是一个帮助Obsidian完成图片和视频文件排版的Ob插件。它可以一定程度上解决在Obsidian中无法快速美观地完成媒体文件的视觉排版问题。

## 请注意

作者没有编程基础，开发过程主要依靠CodeX完成。测试过程中发现的bug作者已经尽可能修改解决，但以防仍有因技术知识导致的问题，非常建议各位使用者在本地备份一下自己的Obsidian仓库，确保文件安全。
祝各位使用愉快！

## 它能做什么

- 从本地拖拽图片/视频到笔记中时，媒体将自动转换成可进行排版功能的布局块。
- 如果笔记原本就有图片/视频，加载插件后没有被转换成布局块，请单击或者拖拽一下媒体，让笔记检测到媒体即可。
- 布局块中的单个媒体支持拖拽右下角调整大小、按住更改排列顺序或者添加分栏。
- 布局块中整行显示的媒体支持右键选择居左/中/右的对齐方式。
- 当媒体下面没有文字时，拖入新的媒体将自动同行分栏显示。
- 每行最多支持4栏显示，第5个媒体文件将自动放在下一行。
- 同行的媒体块高度一致.
- 右键媒体可以查找文件在目录中的位置。
- 右键媒体可以添加图片注释。
- 图片注释可以选择居左/居中的对齐方式。
- 插件命令Visual Media Layout: Restore all vault layouts to normal media支持将所有媒体转换成原版显示方式，关闭插件前请使用该命令，否则原有媒体将无法正常显示。
- 插件命令Visual Media Layout: Enable automatic media layout conversion为开启布局块排版模式，使用过上一条命令后想重新开启插件功能请使用这条命令。


## 安装

### 从 GitHub Releases上安装

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
