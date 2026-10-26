# 墨页 MarkPage

本地优先的 Markdown 排版阅读与批注应用。Markdown 源文件是唯一的真相源：排版、标注、页面设置与评论全部随 `.md` 一起导出。

**在线使用**：<https://panwanke.github.io/markpage/> —— 无需安装，打开即用。文档只存在浏览器本地，不上传任何服务器。

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
| 工作区 | 多标签、本地自动保存、导入导出 `.md`、源码模式、大纲、专注模式、打印 / PDF |
| 插件接口 | 预留命令、渲染器、文档访问与生命周期 API（暂不开放第三方安装） |

页面设置写入 YAML Frontmatter；用户名与视图开关等偏好保存在浏览器本地。

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
  lib/highlight.ts    精简版代码高亮插件（仅注册常用语言）
  lib/storage.ts      本地文档与偏好存储
  components/         文档视图、工具栏、评论面板、设置与对话框
  plugins/            插件 API 类型与注册表（专注模式为内置示例）
  data/examples.ts    示例库加载
```

## 部署

`npm run build` 产出 `dist/` 纯静态文件，由 `.github/workflows/deploy.yml` 在推送到 `main` 时自动构建并发布到 GitHub Pages，无需提交构建产物。`vite.config.ts` 的 `base: './'` 使用相对路径，因此同一份构建产物也能直接放到 Vercel、Netlify 或任意子路径下托管。
