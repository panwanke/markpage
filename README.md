# 墨页 MarkPage

本地优先的 Markdown 排版阅读与批注应用。Markdown 源文件是唯一的真相源：排版、标注、页面设置与评论全部随 `.md` 一起导出。

**在线使用**：[panwanke.github.io/markpage](https://panwanke.github.io/markpage/) · [markpage-dl2.pages.dev](https://markpage-dl2.pages.dev/)（镜像）—— 无需安装，打开即用。文档只存在浏览器本地，不上传任何服务器。

```bash
npm install
npm run dev      # 开发预览 http://127.0.0.1:5173
npm run build    # 类型检查 + 生产构建
npm test         # 核心链路单元测试
npm run lint     # 静态检查
```

## 核心能力

| 能力 | 实现方式 |
| :--- | :--- |
| Markdown 排版 | unified / remark + rehype 管线，支持 GFM、脚注、表格、任务列表 |
| 公式与代码 | KaTeX 渲染行内与块级公式；highlight.js 只加载常用语言 |
| 选区标注 | 在渲染正文上选字，加粗 / 删除线 / 高亮 / 行内代码 / 文字颜色 / 清除格式，直接写回源码 |
| 多轮评论 | `<comment id="…">` 锚点 + `> [!comment …]` callout，支持回复、解决、删除 |
| 页面系统 | A4 / Letter 实际测量分页，页眉页脚、页码、字号行距 |
| 工作区 | 多标签、本地自动保存、导入 `.md`、源码模式、大纲、专注模式、打印 / PDF |
| 停靠侧边栏 | 示例库 / 工作区 / 大纲是可拖动的面板：拖到一起合并成标签页，拖到底部拆成新组，可关闭、可调宽度、可整栏隐藏；布局随偏好持久化 |
| 多语言 | 中 / 英双语，界面语言即时切换；词表按语言分文件，新增语言只需补一份并注册，类型检查保证不漏键 |
| 外观 | 界面字体与字号缩放（默认 115%，侧栏、状态栏与评论面板一并放大）、正文字体族；随偏好本地保存 |
| 三档导出 | **直接导出**原样带走；**纯净导出**剥掉 comment 锚点、评论块与高亮颜色；**自定义导出**按颜色把标签映射成自己的 class / 行内样式，带实时预览 |
| 插件接口 | 预留命令、渲染器、文档访问与生命周期 API（暂不开放第三方安装） |

页面设置写入 YAML Frontmatter；用户名、视图开关、语言、侧边栏布局与外观（字体 / 字号缩放）等偏好保存在浏览器本地。界面字号通过 CSS 变量 `--ui-scale` 统一缩放，正文字体走 `--doc-font`，与文档自身的字号行距互不干扰。

## 停靠侧边栏

左侧栏由若干**面板组**组成，每组 = 一条标签栏 + 一个内容区，默认「示例库 / 工作区 / 文档大纲」各成一组。

| 操作 | 结果 |
| :--- | :--- |
| 拖动面板标签到另一组的标签栏 | 两组合并，面板变成并排标签页（拖到标签左/右半边决定插入位置） |
| 拖动面板标签到底部虚线投放区 | 该面板拆成独立的新面板组 |
| 拖动标签栏右侧把手 | 调整面板组的上下顺序 |
| 标签上的 `×` / 右上角 `+` | 关闭面板 / 从列表里重新打开 |
| 拖动侧栏右边缘 | 调整宽度（双击复位 236px，范围 190–520） |
| 面板组右上角按钮或工具栏图标 | 整栏隐藏 / 显示 |

布局存在 `markpage.settings.v1` 的 `layout` 字段里，刷新、重开浏览器都保持原样；旧版本只有 `showOutline` 布尔值时会被自动迁移成默认布局。设置 → 通用 里可以一键恢复默认布局。

## 多语言

`src/i18n/locales/` 下每个语言一份**扁平键值**词表：`zh-CN.ts` 是唯一真相源，`en-US.ts` 用 `Record<MessageKey, string>` 约束，漏翻一个键就编译不过。文案支持 `{name}` 占位符。

新增一门语言：

1. 复制 `src/i18n/locales/zh-CN.ts` 为 `xx-XX.ts`，翻译右侧的值；
2. 在 `src/i18n/index.ts` 的 `LOCALES` 数组里加一行 `{ id, label, short, htmlLang, messages }`（`label` 用该语言自称）；
3. 设置 → 语言 里自动出现这个选项，`<html lang>` 与日期格式（`toLocaleDateString`）一并跟着切换。

界面语言在首帧之前就从设置里读出来，不会先闪一下默认语言。翻译只作用于应用外壳：Markdown 正文、评论内容与 Frontmatter 永远原样保留。

## 示例库

`examples/` 下的文档会编译进应用，可在左侧栏「示例库」中一键载入为可编辑文档，也可以直接用「导入」打开。

| 示例 | 用途 |
| :--- | :--- |
| `01-技术设计-插件系统.md` | 多语言代码块、API 表格、任务清单 |
| `02-Markdown-语法总览.md` | 全部语法块型的渲染自检 |
| `03-读书笔记-技术与时间.md` | 长文分页与大纲层级 |

## 源码结构

```
src/
  lib/markdown.ts     渲染管线、源码位置映射、标注与评论的写回
  lib/highlight.ts    精简版代码高亮插件（仅注册常用语言；新增语言须同步 vite.config.ts 的
                      optimizeDeps.include —— 语言文件是 CJS，不预打包 dev 会白屏，有测试守护）
  lib/export.ts       三档导出：标签映射、颜色映射、Frontmatter 裁剪
  lib/fonts.ts        界面 / 正文字体栈与字号缩放边界
  lib/storage.ts      本地文档与偏好存储
  lib/layout.ts       侧边栏停靠布局：面板分组、搬动 / 关闭 / 重排与存储还原
  i18n/               语言注册表与翻译函数；locales/ 下是各语言词表
  components/         文档视图、工具栏、评论面板、设置与对话框
  components/DockSidebar.tsx  可拖动的面板组（标签、投放区、宽度调节）
  plugins/            插件 API 类型与注册表（专注模式为内置示例）
  data/examples.ts    示例库加载
```

## 部署

`npm run build` 产出 `dist/` 纯静态文件，由 `.github/workflows/deploy.yml` 在推送到 `main` 时自动构建并发布到 GitHub Pages，无需提交构建产物。`vite.config.ts` 的 `base: './'` 使用相对路径，因此同一份构建产物也能直接放到 Vercel、Netlify 或任意子路径下托管。

同一次构建会并行发布到两个目标：GitHub Pages 与 Cloudflare Pages（`cloudflare` job 复用 `build` 的 `dist` 产物，凭证存于仓库 Secrets）。两份产物完全一致，互为镜像。
