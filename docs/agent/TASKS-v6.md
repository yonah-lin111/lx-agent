# Agent 与 Harness 继续实施任务文档（v6 一轮：LSP 集成）

本文是"继续实行 agent 功能和 harness"的**任务文档 v6**。v1–v5 已全部落地（v5 的 question/instruction/webfetch 已合入 `dev`，git `f709ef7`）；本轮依据参考项目 [opencode-dev]（`packages/opencode/src/lsp/` + `tool/lsp.ts`）与 [pi-main] 的分析，确定本轮范围 = **LSP 集成（唯一）**，含明确不做项与实施规范。代码执行前需用户确认本文 §6 决策清单。

参考的既有文档：核心架构见 [design.md](./design.md)，扩展体系见 [extensions.md](./extensions.md)，Harness 演进与信任模型见 [harness.md](./harness.md)，SQLite 落盘见 [database.md](./database.md)，上一轮见 [TASKS-v5.md](./TASKS-v5.md)。

## 1. 背景与范围决策

现状（已由代码核验）：

- v1–v5 已落地：Agent 核心、14 内置工具（read/ls/grep/find/write/edit/bash/time/todowrite/web_search/webfetch/task/question/read_skill 条件）+ MCP + 权限三态（含 G5 永久写回 / G6 deny 保护）+ SQLite 会话树 + compaction + task 子代理面板 + git 快照回滚 + continue + fork + todo + kind/provenance + instruction 加载。
- **LSP 缺失**：`ALL_TOOL_NAMES`（`agentRunner.ts:76`）与 `tools/` 均无任何语义代码智能工具；v5 文档明确"LSP 集成排 v6 单列"。
- 工具装配点：`agentRunner.ts:120-155` `createRegistry`（`registry.register` + `setActive`），新增工具在此注册并进 `ALL_TOOL_NAMES`。
- 权限豁免集：`permissions/rule.ts` `EXEMPT_TOOLS`（web_search/read/ls/grep/find/time/read_skill/question）——lsp 归入此集。
- 渲染分派：`AgentToolCallBlock.tsx` 按 `toolName` 分派（read 专用分支 + webSearch/question/subagent/skill/mcp/todo 独立块），新增 lsp 专用块落点清晰。
- **无现成"打开文件"IPC**：main 侧无 `shell.openPath` 通道，renderer 无 `openFileAt` 调用——结果块跳转需新增通道。
- 依赖：`package.json` 无任何 vscode/lsp 相关依赖。

参考实现要点（opencode）：

- `lsp/lsp.ts`：9 个 operation（`goToDefinition`/`findReferences`/`hover`/`documentSymbol`/`workspaceSymbol`/`goToImplementation`/`prepareCallHierarchy`/`incomingCalls`/`outgoingCalls`）；`LspTool` 用 `ctx.ask({ permission: "lsp", patterns: ["*"], always: ["*"] })` 全程免确认（本项目对齐 = 归豁免集）；`workspaceSymbol` 不传 `filePath` 给 workspace/symbol 请求。
- `lsp/language.ts`：`LANGUAGE_EXTENSIONS` 20+ 扩展名→语言名（**映射全量**）。
- `lsp/server.ts`：**只给少数语言配了真实启动器**（`Typescript`→typescript-language-server、`Vue`、`ESLint`、`Oxlint`、`Deno` 等），其余语言无启动器→报错；`NearestRoot`/`StrictNearestRoot` 沿文件向上找 `tsconfig.json`/`package.json` 等作为 workspace root。
- `lsp/client.ts`：`vscode-jsonrpc` 的 `createMessageConnection(StreamMessageReader, StreamMessageWriter)` + `vscode-languageserver-types`；初始化超时 45s；诊断 debounce 等。
- `lsp.ts` 参数：`filePath`（绝对或相对）、`line`/`character`（**1-based，LSP 实际 0-based，需转换**）、`query?`（workspaceSymbol 过滤）。

**范围决策（已确认）**：

| # | 能力 | 结论 |
|---|------|------|
| L | LSP 集成（goToDefinition/findReferences/hover/documentSymbol/workspaceSymbol/goToImplementation/callHierarchy 九操作） | **本轮做（唯一）** |
| E | run 恢复（v3 操作日志） | **不做**（维持 v2–v5 决定，触发条件未到） |
| S | 会话全文搜索（pi FTS5） | **不做**（维持） |
| P | plan 模式 / refs 多分支树 UI | **不做**（维持） |
| M | MCP remote / skill 附带工具 / `/` 命令面板补全 / 流式中发送排队 | **不做**（维持） |

## 2. L：LSP server 生命周期与语言映射

**目标**：会话装配/首次调用时按文件类型选择并 spawn 语言服务器，会话级缓存复用，切换/关闭时回收进程。

### 2.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 语言映射 | **扩展名→语言名全量**（对齐 opencode `LANGUAGE_EXTENSIONS`，20+ 项）；**server 启动器仅子集**：TS/JS/TSX/JSX→`typescript-language-server`（复用本地 `node_modules/typescript/lib/tsserver.js`）、JSON/HTML/CSS/SCSS/LESS→`vscode-langservers-extracted`、Python→`pyright-langserver`；其余语言→error toolResult（"不支持 .go 的 server，扩展名映射无对应启动器"） |
| 2 | 生命周期 | **会话级缓存**：`Map<sessionId:lang, LspClient>`，首次调用 spawn + initialize + 监听；`setSessionId`/会话关闭/应用退出 kill 全部；切换会话冷启动一次，同会话内零重复 spawn |
| 3 | workspace root | **最近 marker 向上查找**（对齐 opencode `StrictNearestRoot`）：从 `filePath` 目录向上找 `tsconfig.json`/`package.json`/`pyproject.toml`/`.git` 等，未命中回退会话 cwd；rootUri 用 `pathToFileURL` |
| 4 | 协议层 | **`vscode-jsonrpc` + `vscode-languageserver-types`**（新增 2 个小依赖）：`createMessageConnection` + `StreamMessageReader/Writer`；不引入 vscode 主包 |
| 5 | 超时/fail-safe | 初始化超时 45s；单请求超时 30s；server 进程崩溃→该 client 标记 error、下次调用重建；请求超时/崩溃→error toolResult 回灌，模型自行收尾 |
| 6 | server 缺失 | 启动器对应命令 `which` 不存在→error toolResult 提示安装（`npm i -g typescript-language-server` 等）；**不自动下载**，避免静默装包 |
| 7 | 权限 | **归豁免集**（`EXEMPT_TOOLS` 加 `lsp`）：只读检索无副作用，对齐 opencode `always: ["*"]`，永不询问 |

### 2.2 实现要点

- **`src/main/agent/lsp/language.ts`**（新）：`LANGUAGE_EXTENSIONS` 全量映射（扩展名→语言名）。
- **`src/main/agent/lsp/server.ts`**（新）：`LspServerInfo`（语言/扩展名→命令、args、initializationOptions、root 探测 markers）；`resolveServer(language, cwd): { command, args, root } | null`；`StrictNearestRoot` 实现。
- **`src/main/agent/lsp/client.ts`**（新）：`LspClient` 类——spawn 子进程（`child_process.spawn`，stdio pipe）、`vscode-jsonrpc` 连接、`initialize`（含超时）、9 操作请求封装（0-based 转换）、`shutdown`/`exit`、崩溃监听。
- **`src/main/agent/lsp/lspManager.ts`**（新）：会话级单例（对齐 `permissionManager`）——`Map<sessionId, Map<lang, LspClient>>`；`getClient(sessionId, filePath)`（映射语言→resolveServer→存在性检查→spawn 缓存）；`clearSession(sessionId)` kill 全部；`dispose()`。
- **runner**（`agentRunner.ts`）：装配 lsp 工具（注入 lspManager + sessionId + cwd）；`createRegistry` 注册 `lsp` 进 `ALL_TOOL_NAMES`（内置 14 → 15）；`setSessionId` 切换/`agent_end` 时 `lspManager.clearSession`。

## 3. lsp 工具（tool 层）

### 3.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 参数 | `{ operation: 9 字面量之一; filePath: string; line: number(1-based); character: number(1-based); query?: string }`；`filePath` 相对路径经 `resolveToCwd` 解析（越界拒绝）；`line`/`character` 转 0-based 后发 LSP |
| 2 | 执行模式 | `executionMode: "parallel"`（只读、无副作用、互不依赖） |
| 3 | 输出形态 | toolResult `content` = 紧凑文本（`file:line:col|signature` 多行，对齐 design.md 文本回灌规范）；`details` 记 `{ operation, filePath, results }`（结构化，UI/审计，不进模型上下文） |
| 4 | 操作差异 | `hover`→文档/类型文本；`documentSymbol`→符号树扁平文本；`workspaceSymbol`→不传 filePath 给 workspace/symbol 请求；`callHierarchy` 三子请求（prepare/incoming/outgoing）由模型按需选操作（不做封装合并） |
| 5 | 失败语义 | 不支持语言 / server 缺失 / 初始化失败 / 请求超时 / 进程崩溃→error toolResult 回灌（模型自行解释调整），不中断 run |
| 6 | IPC | **无新 invoke channel**（lsp 是同步工具调用，无挂起交互）；仅新增跳转通道 `app:openFileAt`（见 §4） |
| 7 | 持久化 | 随 toolResult message entry 落库（复用 `agent_session_entry`）；`details.results` 供恢复后渲染块复用跳转；无新表 |

### 3.2 实现要点

- **工具**（新 `src/main/agent/tools/lsp.ts`）：`createLspTool({ lspManager, sessionId, cwd })`；`execute` 内：resolveToCwd → lspManager.getClient → 操作请求 → 格式化紧凑文本 → 返回 `{ content, details }`。
- **注册**：`agentRunner.ts` `ALL_TOOL_NAMES` 加 `lsp`；`EXEMPT_TOOLS` 加 `lsp`（`permissions/rule.ts`）。
- **依赖**：`package.json` 加 `vscode-jsonrpc` + `vscode-languageserver-types`（main 进程使用）。

## 4. 渲染与跳转（renderer）

### 4.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 渲染块 | **新 `AgentLspBlock.tsx`**：定义/引用/符号结果→`file:line:col` 可点击行列表（点击跳转打开）；hover→纯文本/文档块；无结果→单行摘要；集成进 `AgentToolCallBlock` 分派（lsp 独立分支，对齐 read） |
| 2 | 跳转实现 | **新 IPC `app:openFileAt(path, line)`**：main 侧 `shell.openPath(path)` 用系统默认编辑器打开 + 定位行；renderer 点击行触发；项目当前无现成打开文件通道，需新建 |
| 3 | 数据流 | `details.results` 经 toolResult message 落库；恢复会话时 renderer 从消息 entry 读回结果，渲染块复用跳转能力 |
| 4 | 分组 | lsp 调用并入现有工具分组（`TOOL_GROUP_SEPARATORS` 加 lsp，对齐 read/grep 语义）；不新建 webSearch 式独立分组 |

### 4.2 实现要点

- **IPC 三层**：新 `APP_CHANNELS.openFileAt = "app:openFileAt"`（或并入 agentChannels，实现时定）；`appHandlers.ts`/`agentHandlers.ts` 薄转发（`shell.openPath`，含行号透传）；preload/api 暴露。
- **渲染**：新 `src/renderer/src/features/agent/components/AgentLspBlock.tsx`；`AgentToolCallBlock.tsx` 加 `toolName === "lsp"` 分支 + `TOOL_ICONS` 加 lsp icon（lucide `Braces`/`Code`）；`AgentExecutionGroup.tsx` `DOT_COLOR` 加 lsp 配色（实现时定，不与现有重合）。
- **文档同步**：extensions.md §3 内置工具清单补 `lsp` 表项、§2 `ALL_TOOL_NAMES` 14 → 15；harness.md §3.1 豁免集补 `lsp`；design.md §2 架构图补 LSP 来源。

## 5. 明确不做项及说明

| 项 | 说明 |
|----|------|
| **run 恢复（resume）** | 维持 v2–v5 决定；触发条件未到 |
| **FTS5 会话全文搜索** | 维持 v4/v5 决定，留口 |
| **plan 模式 / refs 多分支树 UI** | 分支可视化 / plan-build 分离，维持 |
| **MCP remote / skill 附带工具 / `/` 补全 / 流式排队** | 维持 |
| **LSP 诊断推送（publishDiagnostics）** | 本轮只做按需查询 9 操作，不做主动诊断流式推送（复杂度独立，后续可加） |
| **20+ 语言 server 启动器全量实现** | 仅 TS/JS/JSON/HTML/CSS/Python 配启动器；其余语言映射存在但返回"无启动器"错误（对齐 opencode 实际行为） |
| **LSP 事件/日志 UI**（server 状态面板） | 无独立状态展示；错误经 error toolResult 回灌 |
| **跨语言/多 root 复杂 workspace 场景** | 单一 marker root + 会话级缓存覆盖常见单项目场景 |

## 6. 决策清单（全部已确认）

- 范围 = LSP 集成（唯一）；排除 E/S/P/M（§1/§5）。
- 语言映射 = 扩展名全量 + server 启动器子集（TS/JS/JSON/HTML/CSS/Python）；其余语言清晰报错（§2.1 #1）。
- 生命周期 = 会话级缓存（`Map<sessionId:lang, LspClient>`），首次 spawn，切换/关闭 kill（§2.1 #2）。
- 协议层 = `vscode-jsonrpc` + `vscode-languageserver-types`，新增 2 小依赖（§2.1 #4）。
- workspace root = 最近 marker 向上查找，回退会话 cwd（§2.1 #3）。
- 工具 = 9 操作 + `{ filePath, line(1-based), character(1-based), query? }`；**归豁免集**；`executionMode: parallel`；紧凑文本回灌 + `details.results` 落库（§3.1 #1–7）。
- 渲染 = 新 `AgentLspBlock`，`file:line:col` 点击跳转；**新 IPC `app:openFileAt`** → `shell.openPath` 系统编辑器打开（§4.1 #1–4）。

无待确认项。

## 7. 实施规范与验证

- **工作区**：确认后在 `.worktrees` 新建 worktree（命名 `时间戳-v6-lsp`），在 worktree 内执行全部代码改动；完成 + 自测后询问用户是否合并回 `dev`。
- **IPC 三层契约**：`app:openFileAt` channel（常量 / preload / main handler）同步；lsp 工具无新 push channel（`agent:event` 不变）。
- **依赖**：`vscode-jsonrpc` + `vscode-languageserver-types` 加入 `package.json`（main 进程）。
- **精确校验**（仅受影响范围）：`pnpm typecheck` + Biome format 受影响文件；补 vitest 单测：
  - `test/main/agent/lsp/`：`language`（扩展名→语言映射全覆盖）、`server`（resolveServer 语言→命令/root marker 探测/不存在回退）、`client`（0-based 转换、初始化/请求超时、进程崩溃标记）、`lspManager`（会话级缓存复用、clearSession kill、切换重建）。
  - `test/main/agent/tools/lsp.test.ts`：工具装配（不支持语言/server 缺失/成功回灌/越界拒绝）。
  - `test/main/agent/permissions/`：lsp 归豁免集永不询问。
- 完成检查：无遗留旧导入、无重复 DTO、无重复 channel、无无用目录；改动不破坏既有文档描述的接口（按 §4.2 文档同步更新除外）。
