# Agent 与 Harness 继续实施任务文档（v5 一轮：question 工具 + instruction 加载 + webfetch）

本文是"继续实行 agent 功能和 harness"的**任务文档 v5**。v4 一轮（todo 清单 + kind/provenance）已落地合并（git `a298b5b` 前后）；本轮依据参考项目 [opencode-dev]（`packages/opencode/src/tool/question.ts` + `question/`、`session/instruction.ts`、`tool/webfetch.ts`）与 [pi-main] 的分析，确定本轮范围 = **question 工具（主）+ instruction 加载（主）+ webfetch（主）**，含明确不做项与实施规范。代码执行前需用户确认本文 §6 决策清单。

参考的既有文档：核心架构见 [design.md](./design.md)，扩展体系见 [extensions.md](./extensions.md)，Harness 演进与信任模型见 [harness.md](./harness.md)，SQLite 落盘见 [database.md](./database.md)。

## 1. 背景与范围决策

现状（已由代码核验）：

- v1–v4 已落地：Agent 核心、10 内置工具 + MCP + read_skill、权限三态（含 G5 永久写回 / G6 deny 保护）、SQLite 会话树、compaction、task 子代理 + 独立面板、git 快照回滚、continue、fork、todo + kind/provenance。
- **mermaid 渲染已内置**：`package.json` 有 `mermaid ^11.16.0`；`src/renderer/src/features/markdown/components/MermaidDiagram.tsx` 完整渲染器（缩放/平移/锁定/暗色主题/`securityLevel: strict`）；`markdownRenderer` 的 `fence` 规则已把 ```` ```mermaid ```` 代码块渲染成图，走 `LxMarkdownPreview`。**question 的"绘图"诉求零新增依赖**。
- 挂起交互已有成熟模式：`permissionManager.gate` 挂起 Promise + `permission_request` 事件（`agent:event`）+ `agent:permissionResponse` invoke 回传（[harness.md](./harness.md) §3.5）。question 工具本质是同类"模型执行中被用户打断"，复刻此模式。
- 系统提示词装配点：`agentRunner.ts:306/337` 仅 `DEFAULT_SYSTEM_PROMPT + formatSkillsForPrompt(this.activeSkills)`，**无任何 instruction 文件加载**。
- 工具门控常量：`permissions/rule.ts` 的 `GATED_BUILTIN_TOOLS`（bash/write/edit）与 `EXEMPT_TOOLS`（read/ls/grep/find/time/read_skill/web_search）——question 归豁免、webfetch 进门控。

参考实现要点：

- opencode `question.ts` + `question/index.ts`：`Prompt = { question, header?, custom?, options? }`、`Option = { label, description? }`、`Answer = string[]`（多选）；`question.ask` 挂起 Deferred，用户 `reply`/`reject` 收口，`reject` → `RejectedError`（"用户 dismiss"）→ 工具 error → 模型继续。
- Claude Code question 工具（经本 harness `AskUserQuestion` 一手 schema 核验）：`questions`（1..4）+ `header`（≤12 字符 chip）+ `multiSelect` + `options`（2..4）+ `preview`（文本预览）。
- opencode `instruction.ts`：global `AGENTS.md`/`~/.claude/CLAUDE.md` + project `AGENTS.md`/`CLAUDE.md`/`CONTEXT.md`（findUp），拼入 system prompt。
- opencode `webfetch.ts`：`{ url, format: text|markdown|html, timeout? }`，`ctx.ask` 门控（`permission: "webfetch"`、`patterns: [url]`），`turndown` + `htmlparser2` 做 HTML→markdown/text，5MB 上限。

**范围决策（已确认）**：

| # | 能力 | 结论 |
|---|------|------|
| Q | question 工具（模型执行中向用户提问，支持 markdown/mermaid 内容） | **本轮做（主）** |
| I | instruction 加载（AGENTS.md / CLAUDE.md 注入 system prompt） | **本轮做（主）** |
| W | webfetch 工具（拉取 URL 原文，HTML→markdown） | **本轮做（主）** |
| L | LSP 集成（goToDefinition / findReferences / hover / documentSymbol / workspaceSymbol / callHierarchy） | **不做，排 v6** |
| E | run 恢复（v3 操作日志） | **不做**（维持 v2–v4 决定） |
| G1/G2/G3/G4 | MCP remote / skill 附带工具 / `/` 命令面板补全 / 流式中发送排队 | **不做**（维持） |
| S | 会话全文搜索（pi FTS5） | **不做**（维持） |
| refs 多分支树 UI / plan 模式 | 分支可视化 / plan-build 分离 | **不做**（维持） |

## 2. Q：question 工具

**目标**：新增内置工具 `question`，让模型在执行中向用户提问（选择题或自由文本），答案作为 toolResult 回灌；提问内容支持 markdown（含 mermaid 图自动渲染）。

### 2.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 数据形态 | `inputSchema = { questions: QuestionPrompt[] }`，`QuestionPrompt = { question: string(markdown, 1..2000); header?: string(≤12); options?: { label; description? }[](2..4); multiSelect?: boolean }`；`questions` 长度 1..4 |
| 2 | 绘图 | **question 内容 = markdown**：模型写 ```` ```mermaid ```` 块即自动成图（复用 `LxMarkdownPreview` + `MermaidDiagram`）；**不新增 `diagram` 字段、不引入 SVG 渲染器**（mermaid 已 `strict`，无 sanitize 风险） |
| 3 | 答案形态 | `Answer = { question: string; answer: string[] }[]`（`answer` 恒数组：单选/自由文本 = 长度 1；多选 = 多值）；`options` 命中 → 返回 label 文本，未命中/自由文本 → 原样字符串 |
| 4 | 回灌形态 | toolResult `content` = 格式化文本（对齐 opencode）：`User answered: "q1"="a1", "q2"="a2,b2". Continue with the answers.`；`details` 记 `{ answers }`（UI/审计，不进模型上下文） |
| 5 | 权限 | `question` **归豁免集**（`EXEMPT_TOOLS`，纯交互无副作用，对齐 `todowrite`/`time`/`read_skill` 免询问） |
| 6 | 执行模式 | `executionMode: "sequential"`（阻塞交互必须独占，避免与同批其它工具并发导致多面板并存） |
| 7 | IPC 契约 | 新增 `AgentEvent` 变体 `{ type: "question_request"; request: QuestionRequest }`（复用 `agent:event` 通道）+ 新 invoke `agent:questionResponse`（`(requestId, answers | dismiss)`）；与 permission 完全并列对称 |
| 8 | 挂起/fail-safe | 挂起期间 run 暂停；**abort / 关窗 / 超时（5 分钟）→ 挂起 Promise reject → 工具返回 error toolResult（"用户未回答"）→ run 继续，模型自行收尾**，面板关闭；对齐 permission fail-safe |
| 9 | 子代理上浮 | `questionManager` 做成与 `permissionManager` 一样的**单例**（sessionId 作用域 pending map）；父子 Agent 共用同一 event sink，子代理内 `question` 自然上浮到父 renderer 面板，答案回灌子代理工具，**无需特殊处理** |
| 10 | UI | 新 `QuestionRequestPanel.tsx`，镜像 `PermissionRequestPanel`（输入框上方浮层 + 键盘 ↑↓/Enter/Esc + 鼠标悬停/点击 + 面板打开期间独占键盘）；**question 与 permission 同一时刻最多一个 pending**（question 为 sequential，且 permission 门控在工具执行前，天然互斥） |
| 11 | 持久化 | question 为**瞬时交互**，不落独立 entry；答案随 toolResult message entry 落库（恢复/回看自然携带），无新表、无 schema 变更 |

### 2.2 实现要点

- **contracts**（`src/shared/contracts/agent.ts`）：新增 `QuestionPrompt` / `QuestionOption` / `QuestionRequest`（含 `requestId`）/ `QuestionAnswer` / `QuestionResponse`；`AgentEvent` union 加 `{ type: "question_request"; request: QuestionRequest }`。
- **工具**（新 `src/main/agent/tools/question.ts`）：`createQuestionTool(deps: { askQuestion })`，`name: "question"`，`execute` 内 `await deps.askQuestion(request, signal)` 挂起等答案，返回 `{ content, details: { answers } }`；signal abort → reject。
- **questionManager**（新 `src/main/agent/question/questionManager.ts`，镜像 `permissionManager`）：`ask(request, sessionId, signal, sendRequest)` 挂起 Promise + 推 `question_request` 事件；`respond(requestId, answers | dismiss)` 解析；`clearSession(sessionId)` 清理挂起 + 按拒绝。
- **runner**（`agentRunner.ts`）：装配 question 工具（`askQuestion` 注入 manager + eventSink + sessionId + signal）；`createRegistry` 注册 `question` 进 `ALL_TOOL_NAMES`（内置 10 → 11）；`EXEMPT_TOOLS` 加 `question`（`permissions/rule.ts`）；`setSessionId` 切换时 `clearSession`。
- **IPC 三层**：`agentChannels.ts` 加 `questionResponse: "agent:questionResponse"`；`agentHandlers.ts` 薄转发 + `isValidQuestionResponse` 边界校验（requestId 存在，否则 `{ ok: false }`）；`preload/api/agent.ts` 暴露。
- **renderer**：
  - `hooks/useAgentChat.ts`：新增 `pendingQuestion` 状态 + `respondQuestion`；订阅 `question_request` / `agent_end`（清空）。
  - 新 `components/QuestionRequestPanel.tsx`：渲染问题列表（markdown 经 `LxMarkdownPreview`，mermaid 自动成图）+ 每问选项按钮（`multiSelect` 多选）或自由文本输入；`options` 命中直接回传 label，自由文本提交回传字符串。
  - `AgentPage.tsx`：`pendingQuestion` 传入 `AgentInput` 上方（与 `PermissionRequestPanel` 并列挂载点，互斥渲染）。

## 3. I：instruction 加载

**目标**：会话装配时加载项目/user 级指令文件（AGENTS.md / CLAUDE.md），注入 system prompt，让 Agent 遵循项目规范。

### 3.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 来源与优先级 | user 级 `~/.lx/AGENTS.md` + 项目级 `<cwd>/AGENTS.md` → `<cwd>/CLAUDE.md`（项目级二选一、命中即停）；**只读 cwd 根目录，不递归 findUp**；与 skill 双来源机制同构 |
| 2 | 注入时机 | **会话装配时一次性**（`ensureReady` 创建 Agent 时，与 `formatSkillsForPrompt` 并列拼入 system prompt）；会话 cwd 冻结，无需每轮重读 |
| 3 | 注入形态 | `Instructions from: <abs path>\n<content>`（对齐 opencode），拼接于 skill 注入块之后 |
| 4 | 与 skill 关系 | 独立于 skillLoader：skill = 可复用指令包（按需 read_skill），instruction = 项目/user 级常驻规范（无条件注入）；互不混用 |
| 5 | 失败语义 | 文件缺失/读取失败静默跳过（空 system prompt 段）；不阻断装配 |
| 6 | 子代理 | 子代理复用父 systemPrompt（task.ts 已有 `systemPrompt` 依赖），instruction 自然继承，**无需单独加载** |
| 7 | 大小上限 | 单文件读取截断（复用 `truncate.ts`，如 50KB），防超大指令淹没上下文 |

### 3.2 实现要点

- **loader**（新 `src/main/agent/instructionLoader.ts`）：`load(cwd): { path, content }[]`——读 `~/.lx/AGENTS.md` + `<cwd>/AGENTS.md`（或 `<cwd>/CLAUDE.md`），截断；`formatInstructions(instructions)` 拼注入块。
- **runner**（`agentRunner.ts`）：`ensureReady` 装配 systemPrompt 时 `DEFAULT_SYSTEM_PROMPT + formatSkillsForPrompt(activeSkills) + formatInstructions(instructions)`；`instructions = instructionLoader.load(cwd)`。
- **无 IPC / 无新 channel / 无落库**：纯 main 装配逻辑，renderer 无感知。
- **文档同步**：extensions.md §7（Skill 接入）之后补 §7.8 或独立小节说明 instruction 加载；design.md §2 架构图补 Instruction 来源。

## 4. W：webfetch 工具

**目标**：新增内置工具 `webfetch`，拉取 URL 原文（HTML→markdown/text），补 web_search「只能搜不能拉原文」的空缺。

### 4.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 参数 | `{ url: string(必须 http/https); format?: "text"|"markdown"|"html"(默认 markdown); timeout?: number(默认 30s，上限 120s) }` |
| 2 | 权限 | **进门控集** `GATED_BUILTIN_TOOLS`（首次 fetch 弹窗确认，可永久允许/永久拒绝，参数匹配 `WebFetch(url)` 前缀 glob） |
| 3 | SSRF 防护 | **默认阻断私网/localhost/内网地址**（解析 URL host，命中 `127.*`/`10.*`/`172.16-31.*`/`192.168.*`/`169.254.*`/`::1`/`localhost` 拒绝），阻断独立于门控（即使放行也不发私网请求） |
| 4 | 响应上限 | 5MB 上限；超限抛错 |
| 5 | HTML 转换 | `turndown`（HTML→markdown）+ `htmlparser2`（HTML→纯文本提取）——**新增两个依赖**；markdown/纯文本 content-type 原样返回 |
| 6 | 输出形态 | `content` = 转换后文本（回灌模型，经 `truncate.ts` 有界）；`details` 记 `{ url, format, contentType, provider: "webfetch" }` |
| 7 | 渲染 | 复用 `AgentWebSearchBlock` 分组或独立 `webFetch` 块；**建议并入 webSearch 分组**（同属"联网"语义），具体渲染块实现时定 |
| 8 | 执行模式 | `executionMode: "parallel"`（只读，无副作用） |
| 9 | 失败语义 | 门控拒绝 → error toolResult 回灌（模型自行解释）；网络失败/超时/超限 → error toolResult；匿名直连（无认证） |

### 4.2 实现要点

- **工具**（新 `src/main/agent/tools/webfetch.ts`）：`createWebFetchTool()`；`execute` 内：校验 url scheme → SSRF host 校验 → `fetch`（Node 全局 fetch 或既有 HTTP client）→ content-type 分派 → turndown/htmlparser2 转换 → `truncate.ts` 有界 → 返回。
- **门控**：`permissions/rule.ts` 的 `GATED_BUILTIN_TOOLS` 加 `webfetch`（参数匹配语义 `WebFetch(url)` 前缀 glob，复用现有 `Write/Edit` 路径匹配分支）。
- **注册**：`agentRunner.createRegistry` 注册 `webfetch` 进 `ALL_TOOL_NAMES`（内置 11 → 12）。
- **依赖**：`package.json` 加 `turndown` + `htmlparser2`（main 进程使用）。
- **文档同步**：extensions.md §3 内置工具清单补 `webfetch` 表项、§2 `ALL_TOOL_NAMES` 10 → 12；harness.md §3.1 门控集补 `webfetch`。

## 5. 明确不做项及说明

| 项 | 说明 |
|----|------|
| **L. LSP 集成** | 语义代码智能（goToDefinition/findReferences/hover/documentSymbol/workspaceSymbol/callHierarchy），需 spawn 语言服务器 + 生命周期 + 位置映射，复杂度与风险独立，排 v6 单列 |
| **E. run 恢复** | 维持 v2–v4 决定；触发条件未到 |
| **G1/G2/G3/G4** | MCP remote / skill 附带工具 / `/` 命令面板补全 / 流式中发送排队，维持 |
| **S. 会话全文搜索** | 维持 v4 决定，留口 |
| **refs 多分支树 UI / plan 模式** | 分支可视化 / plan-build 分离，维持 |
| **question 的 SVG/Canvas 自由绘图** | 绘图 = markdown/mermaid（已内置渲染），不做自由 SVG 画板 |
| **instruction 递归 findUp / 跨 app（~/.claude/CLAUDE.md）** | 只读 user + cwd 根，避免跨 app 泄漏与遍历复杂度 |
| **webfetch 渲染独立新块** | 并入 webSearch 分组，不新增独立块组件（实现时定） |

## 6. 决策清单（全部已确认）

- 范围 = question（主）+ instruction（主）+ webfetch（主）；排除 L/E/G1–G4/S/refs 树/plan（§1/§5）；**LSP 排 v6**。
- question：markdown 内容（mermaid 自动成图）+ `options` 选择题 + `multiSelect` + 自由文本兜底；`Answer = { question, answer: string[] }[]`；**归豁免集**；`executionMode: sequential`；新 `question_request` 事件 + `agent:questionResponse` invoke；fail-safe = abort/关窗/超时(5min) → reject → error toolResult → 模型继续；子代理上浮（共享 questionManager 单例）；UI = `QuestionRequestPanel` 镜像 permission 面板（§2.1 #1–11）。
- instruction：user `~/.lx/AGENTS.md` + 项目 `<cwd>/AGENTS.md` → `<cwd>/CLAUDE.md`（命中即停、不递归）；会话装配时一次性注入 system prompt；缺失静默；子代理继承（§3.1 #1–7）。
- webfetch：`{ url, format?, timeout? }`；**进门控集 + 阻断私网 IP**；5MB 上限；turndown + htmlparser2 新增依赖；默认 markdown；渲染并入 webSearch 分组（§4.1 #1–9）。

无待确认项。

## 7. 实施规范与验证

- **工作区**：确认后在 `.worktrees` 新建 worktree（命名 `时间戳-v5-question-instruction-webfetch`），在 worktree 内执行全部代码改动；完成 + 自测后询问用户是否合并回 `dev`。
- **IPC 三层契约**：`agent:questionResponse` channel（常量 / preload / main handler）同步；`question_request` 复用 `agent:event`（无新 push channel）；`AgentEvent` union 加变体属契约演进，renderer/preload 同步（design.md §7 规范）。
- **文档同步**：extensions.md §2/§3 内置工具 10 → 12 补 `question`/`webfetch` 表项；harness.md §3.1 门控集补 `webfetch`、豁免集补 `question`；design.md §2 架构图补 instruction/question 来源。
- **精确校验**（仅受影响范围）：`pnpm typecheck` + Biome format 受影响文件；补 vitest 单测：
  - `test/main/agent/`：question 工具（挂起/回灌/fail-safe abort）、questionManager（pending/respond/clearSession 按拒绝）、webfetch（SSRF host 阻断、content-type 分派、超限）、instructionLoader（来源优先级/截断/缺失静默）。
  - `test/main/agent/permissions/`：webfetch 门控（放行/拒绝/永久写回）。
- 完成检查：无遗留旧导入、无重复 DTO、无重复 channel、无无用目录；改动不破坏既有文档描述的接口（按 §7 文档同步更新除外）。
