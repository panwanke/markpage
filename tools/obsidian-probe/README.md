# MarkPage P0：由用户操作的 Obsidian 兼容探针

这是实施计划 P0 的诊断工具，尚不是 MarkPage 编辑器。它不会接管 Markdown
默认打开方式，也不把模拟结果当作真实宿主验收通过。当前只锁定 SDK 1.8.7
进行类型检查；`minAppVersion` 是探针的候选运行门槛，不是已验证的产品支持下限。

## 准备

在项目根运行 `npm run prepare:obsidian-probe`。该命令只构建诊断插件并新建一个
`validation-results/MarkPage-P0-时间/` 合成测试库，终端会输出完整路径。
它不启动或控制 Obsidian，不修改现有知识库，不自动启用插件。
每次运行生成新测试库，旧记录会保留。

生成文件包括 `Probe.md`、`Probe.svg`、库标记和
`.obsidian/plugins/markpage-compat-probe/` 下的插件文件。缺少专用库标记时，
插件会在注册视图和写入测试数据之前拒绝启动。

## 你在 Obsidian 中的操作

1. 从“管理仓库 / Manage vaults”选择“打开文件夹作为仓库 / Open folder as vault”，
   选择终端输出的 `MarkPage-P0-…` 文件夹。不要选择项目根或个人知识库。
2. 在这个测试库的“设置 → 第三方插件 / Community plugins”中允许使用第三方插件，
   然后启用 **MarkPage compatibility probe**。这些操作由你完成。
3. 用原生视图打开 `Probe.md`。按 `Ctrl+P`，执行
   **MarkPage compatibility probe: Run automatic host probes**。
   应出现完成提示，并在旁边打开诊断视图，显示绿色图片和 callout。
   脚本会新增一份 `Process-时间.md` 测试文件，验证比较写入、冲突拒绝与 10 次并发写入。
4. 保留诊断视图，在原生 `Probe.md` 中切换 Source mode 或 Live Preview。
   诊断视图应显示 `authority: native-editor`。输入一行 `native-002`。
   原生窗格改为 Reading view 后，在已落盘条件下应显示 `available`，
   `readingPanes` 应增加。再切回编辑状态，确认再次变为 `native-editor`。
5. 执行 **Delay next Probe.md write by 10 seconds**，立即在原生 `Probe.md`
   末尾输入 `delayed-003`，然后关闭这个原生编辑标签，保留诊断视图。
   在延迟期间，预期显示 `waiting-for-disk`；10 秒后落盘才回到 `available`。
   若没有观察到等待，保留结果反馈，不能据此判定通过。
6. 执行 **Save diagnostic report**。将当前测试库中的
   `.obsidian/plugins/markpage-compat-probe/data.json` 路径发给 agent，
   同时说明步骤 3–5 是否符合预期、实际 Obsidian 版本及异常提示。
   如方便，可保留第 5 步等待期间的截图作为人工证据。
7. 如需测试正常卸载：先保存报告，再禁用探针插件，确认诊断界面关闭、
   原生编辑与保存恢复正常。重新启用后会开始新的内存观察记录；
   先备份旧 `data.json` 再开启下一轮。

探针不自动执行这些 Obsidian 操作。agent 只读取你交回的结果文件。

## 更新已打开的测试库中的探针

诊断修订 2 修复了原生编辑器尚在加载时采样到空字符串、随后持续显示
`diskMatchesObservedBuffer: false` 的问题。它会更新初始采样，仍保留真实
`editor-change` 事件，避免将实际清空文档与初始加载混为一谈。

1. 先执行 **Save diagnostic report**，备份当前 `data.json`，再禁用探针。
2. 将项目 `tools/obsidian-probe/dist/` 内的 `main.js`、`manifest.json`、
   `styles.css`、`build-info.json` 复制覆盖到当前合成库的
   `.obsidian/plugins/markpage-compat-probe/`；保留 `data.json` 和测试笔记。
3. 重新启用探针并打开诊断视图。对未编辑、已加载的 `Probe.md`，预期
   `diskMatchesObservedBuffer: true`。然后完成上文第 4–6 步并保存报告。
4. 新报告应包含 `diagnosticRevision: 2`。如仍为旧版，确认复制目标是当前测试库，
   并重新禁用、启用插件。agent 不代执行复制到已安装插件或重载等宿主操作。

## 原生保存延迟的实现与恢复

延迟命令仅在合成库中，对下一次 `Probe.md` 的公开 `DataAdapter.write` 调用
加入 10 秒等待，用于暴露“编辑窗格关闭但数据尚未落盘”的窗口。
它不调用原生编辑器的私有保存 API。卸载时恢复原适配器并释放等待中的写入。
如果宿主版本绕过该入口，报告可能没有 `write-delay-started`，该场景记为未验证。

该插桩只用于诊断，不属于未来正式插件的保存实现。`Vault.read` 是否反映
已持久化的内容也需由这次实测判断；若错误提前解锁，必须先修正接口方案。

## 结果与边界

`data.json` 保存时间线与独立探针结果，不保存笔记正文、机器用户名或真实库路径。
`build-info.json` 记录构建 SHA、dirty、SDK 与构建时间。自动结果不是完整
V40/V43/V46 的 PASS：还缺真实产品编辑、故障恢复、强制终止、IME、PDF/音视频、
最低版本和多窗口验收。插件名称也与计划中的正式 `markpage` 插件不同。

若自动检查失败，先保存 `data.json` 和异常提示，保留 `Process-*.md`；不要反复运行
覆盖诊断现场。若未见插件，确认打开的是输出路径对应的测试库，且文件位于该库
`.obsidian/plugins/markpage-compat-probe/` 下。关闭测试库即可停止诊断，
不需要清理任何真实库设置。

开发验证：`npm run test:obsidian-probe`、`npm run build:obsidian-probe`。
全部测试仍由根 `npm test` 覆盖；正式双端构建和发布命令将在后续阶段实现。
