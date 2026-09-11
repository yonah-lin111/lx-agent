# 工具与扩展体系

本文档定义 LX Agent 的全部工具能力契约、装配机制、动态提示词分层、MCP 协议集成、Skill 指令包与 Slash 模板。

架构总览见 [architecture.md](./architecture.md)；安全门控见 [permissions.md](./permissions.md)；运行时管理见 [runtime.md](./runtime.md)；模式协议见 [collaboration-modes.md](./collaboration-modes.md)；生命周期钩子见 [hooks.md](./hooks.md)。

---

## 1. AgentTool 核心契约 (`src/main/agent/core/types.ts`)

```typescript
interface AgentToolResult<TDetails = unknown> {
  content: (TextContent | ImageContent)[] // 唯一回灌给模型上下文的内容
  details?: TDetails                      // 仅供 UI 渲染与审计落库，不占 LLM 上下文
  terminate?: boolean                     // 设为 true 时强制提前结束低层工具循环
}

interface AgentTool<TParams extends z.ZodType = z.ZodType, TDetails = unknown> {
  name: string                            // 工具唯一标识符 (全字母下划线)
  label: string                           // UI 可读名称
  description: string                     // 投递给模型的工具描述
  inputSchema: TParams                    // Zod Schema 强类型参数校验
  prepareArguments?: (args: unknown) => unknown // 兼容历史或特殊格式参数预处理
  execute(
    toolCallId: string,
    params: z.infer<TParams>,
    signal?: AbortSignal,
    onUpdate?: (update: AgentToolResult<TDetails>) => void
  ): Promise<AgentToolResult<TDetails>>
  executionMode?: "sequential" | "parallel" // 默认 parallel；有写/环境副作用声明 sequential
}
```

### 1.1 契约铁律

- **参数校验前置**：在进入 `execute` 前由框架统一执行 `validateToolArguments`，校验失败立即封装结构化错误 ToolResult 回灌，不触发实际执行。
- **异常非阻塞**：工具执行抛出未捕获异常时，框架捕获并封装为 `isError: true` 的 ToolResult 回灌，主推理循环永不崩溃。
- **快速响应 Signal**：所有长时或网络类工具必须监听并传递 `AbortSignal`，收到打断信号立即退出。

---

## 2. 内置工具全景矩阵

实际注册由 `assembly.ts` 的 `createRegistry()` 完成，按会话能力快照激活。以下为全部内置工具（`tools/visuals.ts` 的 `render_svg` / `render_ascii` / `render_html` 已废弃且**不注册**，回归测试禁止其回归）：

| 工具分类 | 工具名称 | 参数签名 | 核心行为与特性 |
| :--- | :--- | :--- | :--- |
| **文件系统** | `read` | `{ path; offset?; limit? }` | 行号分页读取（1 起始），自动检测二进制文件；超限自动截断 |
| | `ls` | `{ path?; limit? }` | 目录结构遍历，字母排序，包含隐藏文件，目录带 `/` 标识 |
| | `grep` | `{ pattern; path?; glob?; ignoreCase?; literal?; context?; limit? }` | 内容正则搜索：优先系统 `rg`（ripgrep），缺失无缝降级纯 Node 遍历 |
| | `find` | `{ pattern; path?; limit? }` | 文件名匹配搜索：优先系统 `fd`，缺失降级为递归 readdir 模式匹配 |
| | `write` | `{ path; content }` | 文件全量写入/新建，自动创建父级目录；由 `file-mutation-queue` 串行化 |
| | `edit` | `{ path; edits: { oldText; newText }[] }` | 精确块替换：BOM/CRLF 归一化；生成行级结构化 Diff；联动写后 LSP 诊断 |
| | `apply_patch` | `{ patch }` | V4A 格式多文件原子补丁（Add/Update/Delete），全量前置校验，失败整体回滚；Patch 失配经 HarnessFeedbackGuard 反馈自愈 |
| **执行与终端** | `bash` | `{ command; timeout?; background?; session? }` | 通过 `UnifiedExecManager` 调度；支持 `background` 后台作业与 `session` PTY 持久会话 |
| | `job_output` | `{ job_id; wait?; timeout_ms? }` | 消费后台作业的增量输出流（带等待唤醒机制） |
| | `job_list` | `{}` | 查询当前会话内所有存活与已终结后台作业状态 |
| | `job_kill` | `{ job_id; reason? }` | 发送 SIGTERM 并在超时后升级 SIGKILL 终止目标进程树 |
| **系统** | `time` | `{}` | 获取当前系统精确时间戳、本地格式化时间与时区 |
| **记忆与规划** | `memory` | `{ action: "view" \| "save" \| "search" \| "delete"; topic?; name?; description?; type?; content?; query?; path? }` | Claude Code 风格项目分层记忆管理（`MEMORY.md` 索引与 Topic Notes） |
| | `todowrite` | `{ todos: { content; status }[] }` | 任务清单状态机整表替换；驱动状态栏与执行面板；Plan/Review 模式下被硬拦截 |
| **语言服务** | `lsp` | `{ operation; filePath; line?; character?; query? }` | 9 种 LSP 语义操作：`goToDefinition` / `findReferences` / `hover` / `documentSymbol` / `workspaceSymbol` / `goToImplementation` / `prepareCallHierarchy` / `incomingCalls` / `outgoingCalls`；支持懒安装 |
| **交互与协作** | `question` | `{ questions: { question; header; options; multiple? }[] }` | 向用户发起结构化交互式提问（支持 Markdown 与选项选择） |
| | `task` | `{ description; prompt; name?; subagent_id? }` | 启动独立子代理或向 `SubagentPool` 中的既有子代理续接；名称含 `review` 时注入 Review Agent 审查提示词 |
| | `read_skill` | `{ name }` | 读取并加载指定 Skill 指令包的完整 Markdown 正文 |
| **网络检索** | `web_search` | `{ query; numResults?=8; type? }` | 优先 Exa (mcp.exa.ai) 检索，Tavily (api.tavily.com) 兜底；`numResults` 上限 10 |
| | `webfetch` | `{ url; format?=markdown; timeout?=30s }` | URL 内容抓取与 HTML 转 Markdown，内置私网/Localhost SSRF 严格阻断 |
| **图像** | `view_image` | `{ path; detail?="high" }` | 本地图片查看：魔数探测 + 双路径预处理（≤4MiB 且未超限直传，否则缩放重编码；`high` 长边 ≤2048 / `original` ≤6000）；仅视觉模型注册（见 view-image.md） |

### 2.1 装配与能力快照 (`assembly.ts` / `capabilityService.ts`)

- `createRegistry(cwd, activeTools, mcpToolNames, withReadSkill, taskDeps?, questionDeps?, lspDeps?, sessionDeps?)` 注册内置全集；`lsp` / `question` / `task` 依赖对应 deps 存在才注册，`view_image` 依赖 `sessionDeps.supportsImages` 门控（非视觉模型不注册/不激活），MCP 工具仅注册白名单命中的已连接项，`read_skill` 由 Skill 激活状态决定。
- `setActive()` 按会话 `active_capabilities` 快照过滤，配置中引用的未注册工具（历史遗留）自动剔除。
- 能力快照随会话冻结，仅在能力集实际变化时追加 `active_capabilities` entry（见 database.md）。

---

## 3. 动态提示词装配体系 (`SystemPromptManager`)

`src/main/agent/prompts/systemPromptManager.ts` 提供分段（Section）、运行时上下文（Context）、变量（Variable）与拦截器（Interceptor）四类注册点，按 order 升序装配；全局层与 `sessionId` 作用域层合并（同名 scoped 覆盖 global）：

```typescript
export const PROMPT_ORDERS = {
  IDENTITY: -100,               // 基础身份定义
  BEHAVIOR: -50,                // 通用行为规范（对齐 Codex harness 行为层）
  PERSONA: 0,                   // 人格（pragmatic / friendly）+ 核心操作规范
  MODEL_ADAPTIVE: 50,           // 模型自适应指令（Codex / Claude / Generic）
  SKILLS: 100,                  // 已激活 Skill 指令正文
  INSTRUCTIONS: 200,            // AGENTS.md 级联注入（Git Root -> CWD）
  WORKSPACE_MEMORY: 250,        // MEMORY.md 索引摘要
  RUNTIME_CONTEXT: 300,         // 运行时上下文保留位
  ENVIRONMENT: 350,             // <env> 工作目录/分支/平台
  CURRENT_TIME: 355,            // <current_time> 动态时间感知
  CONTEXT_WINDOW_GUIDANCE: 358, // <context_window_guidance> 容量双阈值告警
  SANDBOX_POLICY: 360,          // <sandbox_policy> 沙箱级别声明
  COLLABORATION_MODE: 380,      // 四模式模板（build / plan / review / design）
  INTERCEPTOR: 400,             // 拦截器保留位
} as const
```

- **装配产物**：`PromptAssembly { sections, contexts, variables, rendered }`；空文本段自动跳过，`complete: true` 段独占整个提示词。
- **变量插值**：`{{cwd}}`、`{{session_id}}` 等由内置与注册的 VariableProvider 解析；同一 section/context 可引用。
- **透明审查**：`getPromptAssembly` IPC 返回完整装配结果，执行流程面板逐段展示（含 `harness:context-window-guidance` 等动态注入）。

### 3.1 行为规范要点 (Behavior Harness)

- **Preamble 意图声明**：执行具有副作用（修改文件、执行终端命令、外发请求）的工具前，必须输出 1-2 句明确意图；普通连续只读操作保持静默。
- **手术刀式精准修改**：单点小修改优先使用 `edit`；多文件联动结构化变动优先使用 `apply_patch`；严禁全量无意义覆写。
- **Dirty Worktree 保护**：禁止未经用户明确同意执行 `git reset --hard`、`git checkout --` 等破坏性版本控制指令。
- **定向优先验证**：完成修改后优先运行受影响模块的轻量定向校验（如单测/Lint），严禁盲目跑全量庞大测试套件。
- **前台优先**：长时命令使用 `bash` 的 `background: true`，随后用 `job_output` / `job_list` / `job_kill` 异步管理，不阻塞同步等待。

---

## 4. MCP 扩展集成 (`src/main/agent/mcp/`)

- **传输层标准**：当前采用标准本地 **Stdio MCP Server** 接入规范。
- **生命周期**：由 `McpManager` 单例统一管理，支持连接就绪等待、`ToolListChangedNotification` 动态热重载与退出级联清理。
- **命名空间与 Schema 映射**：
  - 工具命名自动规整为 `sanitize(serverName)_sanitize(toolName)`，避免与内置工具冲突。
  - `jsonSchemaToZod` 动态将 JSON Schema 转换为运行时 Zod 校验器，无法无损解析的高级 Schema 降级为宽松 Record 透传。
  - 每次会话装配按能力快照中的 MCP 白名单包装注册（`wrapMcpTool`），未连接或未授权工具不进入工具集。

---

## 5. Skill 指令包体系 (`src/main/agent/skills/`)

Skill 作为领域级指令包，遵循标准 Markdown 组织格式并具备扩展配置与双轨调用能力：

### 5.1 目录发现三层优先级

加载器扫描三层目录并按照优先级去重覆盖（高优先级同名覆盖）：

1. **用户全局级**：`~/.lx/skills/<name>/SKILL.md`（或直接 `.md` 文件，最高优先级）
2. **项目私有级**：`<cwd>/.lx/skills/<name>/SKILL.md`
3. **标准通用级**：`<cwd>/.agents/skills/<name>/SKILL.md`（对齐 Codex / Agents 标准目录）

### 5.2 双轨调用机制 (Dual-Track Paradigm)

- **显式提及 / 零轮注入 (Zero-Round Injection)**：
  - 用户在输入框中通过 `$` 快捷唤出面板插入 `$skill-name`（或兼容历史 `/skill:name`）。
  - 会话调度器预解析显式 Skill 提及，在首轮交互前直接将对应 Skill 的指令正文及基准路径注入 Prompt（0-round 免工具调用往返）。
- **自主按需读取 (Autonomous Loading)**：
  - 未被显式调用的可用 Skill 会轻量注入 `<available_skills>` 块（含 `name`、`short_description` 与说明）。
  - 当模型判断任务契合描述时，自主调用 `read_skill({ name })` 拉取正文并根据基准路径解析相对文件。

### 5.3 伴生配置与元数据扩展

除 `SKILL.md` frontmatter 的 `metadata.short-description` 之外，支持 Skill 目录下的伴生配置文件（`agents/skill.yaml` 或 `skill.yaml`）：

- **`interface`**：声明 `display_name`、`short_description`、`default_prompt`。
- **`dependencies.tools`**：声明依赖的 MCP 工具服务（如 `type: mcp, value: github`）；调用时若依赖 MCP 未连接，自动追加环境警告。
- **`policy`**：`allow_implicit_invocation: false`（或 frontmatter `disable-model-invocation: true`）隐藏可用声明，仅允许用户显式 `$skill-name` 触发。

### 5.4 前端交互与多语言

- **双入口触发与补全**：`@` 综合提及面板（聚合 Skills / 项目文件 / 设计卡片，Skill 项置顶并标注紫色 `Skill` 标签）与 `$` 专属技能面板；均支持光标跟随定位、键盘导航与回车补全。
- 文案统一接入 i18n 字典（`agent.skillMention` 等命名空间）。

---

## 6. Slash 命令模板 (`promptTemplateLoader.ts`)

- 模板来源：`~/.lx/prompts/*.md`（用户级）与 `<cwd>/.lx/prompts/*.md`（项目级），frontmatter 声明 `description` 与 `argument-hint`。
- 内置保留命令（`RESERVED_COMMANDS`：`/compact`、`/continue`、`/clear` 等）与 `skill:` 前缀不允许被模板覆盖。
- 模板以 UserMessage 的 `command` 元数据标记来源，执行流程面板据此展示指令来源徽标。

---

## 7. 生命周期钩子（Hooks）

工具执行前后的治理扩展点（`PreToolUse` / `PostToolUse` / `PermissionRequest`）以及会话、压缩、子代理等生命周期事件，统一由用户级 hook 体系提供。配置 schema、线协议、失败语义与事件矩阵见 [hooks.md](./hooks.md)。
