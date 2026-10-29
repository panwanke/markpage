# MarkPage for Obsidian — 1.2.0 candidate

在 Obsidian 内以 MarkPage 排版、双栏或源码视图打开 Markdown。插件包含本地共享
编辑器和字体，不需要启动网页或 bridge，也不会替换 Obsidian 默认的 Markdown 视图。

这是供真实宿主测试的候选版。SDK 锁定 1.8.7；manifest 的最低版本目前是候选门槛，
尚未取得该版本的真实运行证据。自动测试与安装包检查通过，不等于整份实施计划或
V01–V62 已完成。测试步骤见 [TESTING.md](TESTING.md)。

## 快速开始

在仓库根目录使用 Node 22.12 或以上的 Node 22：

```powershell
npm ci
npm run prepare:obsidian
```

命令构建插件，并在 `validation-results/MarkPage-Obsidian-时间/` 创建全新合成测试库。
终端输出可直接使用的绝对路径。不会启动 Obsidian、启用插件或改动已有知识库。

1. 在 Obsidian 中选择“打开文件夹作为仓库”，选择终端输出的文件夹。
2. 设置 → 第三方插件，允许第三方插件并启用 **MarkPage**。
3. 用原生视图打开 `Start.md`，切到**阅读模式**。
4. `Ctrl+P` → **MarkPage: 用 MarkPage 打开当前笔记**。
5. 在新窗格中切换排版、双栏、源码；在源码中输入，等待“已保存”或按 `Ctrl+S`。

若界面显示原生编辑器占用，关闭同文件的原生编辑窗格，或把它切到阅读模式。
MarkPage 会等待最后的原生缓冲区真正落盘后才允许编辑。

## 构建与项目边界

源码在 `apps/obsidian/src/`。这里仅拥有 FileView、Obsidian 文件/元数据/资源适配、
设置、安装及构建；共享解析、文档会话和格式算法归 `packages/core`，排版、分页、
源码框、格式工具栏、评论和选区菜单归 `packages/editor`，方言归
`packages/extension-obsidian`。网页和插件使用同一份实现。

```powershell
npm run build:web           # 只构建网页
npm run build:obsidian      # 类型检查、打包、检查安装包
npm run build              # 两端构建
npm run validate:all       # lint、架构、类型、测试、两端构建
```

产物位于 `apps/obsidian/dist/`：

- `main.js`、`manifest.json`、`styles.css`：运行所需文件。
- `LICENSE`、`versions.json`、`build-info.json`：许可、兼容映射、来源版本。
- `markpage-1.2.0.zip`、`SHA256SUMS.txt`：手动安装包和 SHA256 校验。
- `dependency-report.json`：开发检查证据，不装入 Vault。

`obsidian` 是唯一外置运行依赖，其余运行代码与公式字体都打入安装包。
ZIP 不含用户笔记、`data.json`、node_modules、sourcemap 或绝对开发路径。

## 保存与恢复

每个真实 TFile 只有一个控制器和写队列，多个 MarkPage 窗格共用草稿及撤销栈。
输入后 600ms 保存，在 `Vault.process` 的同步回调中再次检查原生编辑器占用和
磁盘内容。外部修改、文件删除、权限/I/O 错误都保留草稿，不自动覆盖或重建文件。

恢复副本独立以 250ms 防抖写入插件 `data.json`，和设置共用串行持久化队列。
冲突时可以另存副本，或先归档本地草稿再载入外部内容。重启发现恢复记录时需显式
选择；不会自动把旧草稿覆盖到 Markdown 文件。强制终止只能保留最后成功写入的恢复
副本，不能保证最后 250ms 内的所有字符。

普通笔记只保存在 Vault 的 `.md` 文件；恢复记录不是第二份永久笔记库。
安装和回退脚本均保留 `data.json`、笔记及插件启用列表。

## 更新已有测试库

先在 Obsidian 禁用 MarkPage，然后在仓库根运行：

```powershell
npm run build:obsidian
npm run install:obsidian -- --vault "D:\你的测试库绝对路径"
```

脚本会先验证路径与安装包，备份旧构建文件，再复制新的构建文件。终端会输出备份
目录。完成后由你重新启用插件。不要覆盖或删除 `data.json`。

若测试库使用自定义配置目录，安装命令加 `--config-dir .obsidian-test`；回退会读取
备份中的原配置目录。目录必须位于所选 Vault 内，越界或符号链接逃逸会被拒绝。

## 回退

先禁用 MarkPage，再使用安装时输出的备份目录：

```powershell
npm run install:obsidian -- --vault "D:\你的测试库绝对路径" --restore-backup "D:\你的测试库绝对路径\.markpage-install-backups\安装时间"
```

回退仅恢复该次安装前存在的构建文件，并移除该次新增的已知构建文件；不递归删除
目录，也不修改设置、恢复记录和笔记。首次安装的备份没有旧版程序，此时回退相当于
移除构建文件，插件保持禁用即可。

## CI 与分发

现有 PR/main workflow 验证两端并上传 `markpage-obsidian` artifact。网页仍部署到
原站点。插件不会自动安装进用户 Vault。

用户自行创建与根版本完全一致的 tag 后，发行 workflow 执行完整检查，生成带独立
资产的 **draft GitHub Release**。完成宿主验收后由用户审阅并发布。不会由开发脚本
创建 tag、push 或发布 Release。此阶段无需 submodule 或第二个源码仓库。

旧 `obsidian-plugin/` 是 **MarkPage Bridge 0.2.1**；它与本目录的 `markpage` 插件
具有不同 manifest id、用途和构建命令。正式插件测试不需要启用 bridge。

## 当前限制

- 真实 Windows Obsidian 的 FileView 生命周期、模式切换、延迟落盘和附件渲染仍须验收。
- 插件不提供打印/PDF 导出；PDF 附件预览交给 Obsidian 的公开渲染接口。
- 不执行 Dataview、Templater 或任意第三方脚本。不自动新建缺失链接指向的笔记。
- 方言、源码映射和扩展 API 的全部计划项尚不能仅凭本次候选包宣称完成。复杂实体或
  转义的显示文本无法证明精确映射时拒绝标注；可改用源码框选择原始文本。
- 可用 `npm run dev` 后访问 `/apps/obsidian/preview/index.html` 检查共享 UI。
  该预览使用内存适配器，不是 Obsidian 模拟器，也不能代替宿主验收。
