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

1. 打开GitHub Releases的插件仓库网页
2. 下载这三个文件即可
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. 在你的Obsidian仓库路径中新建visual-media-layout文件夹

```text
YourVault/.obsidian/plugins/visual-media-layout
```

4. 把下载下来的这三个文件放进去
5. 重启Obsidian.
6. 打开设置-第三方插件-关闭安全模式并启用最下方的Visual Media Layout插件


## 隐私

这个插件是完全本地的，不会调用任何用户信息，主包也不知道怎么调用
