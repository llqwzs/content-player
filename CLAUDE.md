# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指导。

## 项目概述

基于 Electron + Vite 的桌面媒体播放列表播放器。打开本地文件夹，扫描媒体文件（视频、音频、图片），在侧边栏播放列表中展示，并在主区域播放，支持上一个/下一个导航、自动播放和键盘快捷键。

## 命令

- `npm run dev` — 使用 Vite 构建后启动 Electron（将 `src/` 构建到 `dist/`，然后运行 `electron .`）
- `npm run build` — 仅执行 Vite 生产构建（不启动 Electron）

本项目未配置测试或代码检查工具。

## 架构

**进程模型（Electron）：**
- `main.js` — 主进程。创建 BrowserWindow，处理目录选择（`select-directory`）和文件扫描（`scan-directory`）的 IPC 通信。加载 `dist/index.html`。
- `preload.js` — 通过 `contextBridge` 暴露 `window.api` 桥接对象，提供 `selectDirectory()` 和 `scanDirectory(dirPath)` 方法。已启用上下文隔离；Node 集成已关闭。
- `src/` — 渲染进程源码（由 Vite 构建到 `dist/`）。
  - `src/main.js` — 所有渲染逻辑：播放列表渲染、媒体播放切换（视频/音频/图片）、自动播放、键盘导航。
  - `src/index.html` — 单页界面，包含播放列表侧边栏和播放器区域。
  - `src/style.css` — 暗色主题样式。

**关键设计要点：**
- Vite 配置将 `root` 设为 `'src'`，输出到 `../dist`。Electron 主进程从 `dist/` 加载。
- 媒体文件通过绝对路径构造的 `file:///` URL 提供服务。
- 支持的文件扩展名硬编码在 `main.js` 中（`MEDIA_EXTENSIONS` 集合和 `getMediaType` 函数）。
- 目录扫描为非递归模式（仅扫描顶层文件）。
- 界面语言为中文（zh-CN）。
