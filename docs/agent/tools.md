# 工具与扩展体系

本文档定义 LX Agent 的全部工具能力契约、装配机制、动态提示词分层、MCP 协议集成、Skill 指令包、生命周期钩子与 view_image 图片管道。

架构总览见 [architecture.md](./architecture.md)；运行时治理见 [runtime.md](./runtime.md)；安全门控见 [permissions.md](./permissions.md)；模式协议见 [modes.md](./modes.md)。

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

实际注册由 `assembly.ts` 的 `createRegistry()` 完成，按会话能力快照激活。以下为全部内置工具：

| 工具分类 | 工具名称 | 参数签名 | 核心行为与特性 |
| :--- | :--- | :--- | :--- |
| **文件系统** | `read` | `{ path; offset?; limit? }` | 行号分页读取（1 起始），自动检测二进制文件；超限自动截断 |
| | `ls` | `{ path?; limit? }` | 目录结构遍历，字母排序，包含隐藏文件，目录带 `/` 标识 |
| | `grep` | `{ pattern; path?; glob?; ignoreCase?; literal?; context?; limit? }` | 内容正则搜索：优先系统 `rg`（ripgrep），缺失无缝降级纯 Node 遍历 |
| | `find` | `{ pattern; path?; limit? }` | 文件名匹配搜索：优先系统 `fd`，缺失降级为递归 readdir 模式匹配 |
| | `write` | `{ path; content }` | 文件全量写入/新建，自动创建父级目录；由 `file-mutation-queue` 串行化 |
| | `edit` | `{ path; edits: { oldText; newText }[] }` | 精确块替换：BOM/CRLF 归一化；生成行级结构化 Diff；联动写后 LSP 诊断 |
| | `apply_patch` | `{ patch }` | V4A 格式多文件原子补丁（Add/Update/Delete），全量前置校验，失败整体回滚并回灌错误信息 |
| **执行与终端** | `bash` | `{ command; timeout?; background?; session? }` | 通过 `UnifiedExecManager` 调度；支持 `background` 后台作业与 `session` PTY 持久会话 |
| | `job_output` | `{ job_id; wait?; timeout_ms? }` | 消费后台作业的增量输出流（带等待唤醒机制；默认 10000ms，上限 60000ms） |
| | `job_list` | `{}` | 查询当前会话内所有存活与已终结后台作业状态 |
| | `job_kill` | `{ job_id; reason? }` | 发送 SIGTERM 并在超时后升级 SIGKILL 终止目标进程树 |
| **系统** | `time` | `{}` | 获取当前系统精确时间戳、本地格式化时间与时区 |
| **记忆与规划** | `memory` | `{ action: "view" \| "save" \| "search" \| "delete"; topic?; name?; description?; type?; content?; query?; path? }` | 项目分层记忆管理（`MEMORY.md` 索引与 Topic Notes；豁免工具） |
| | `todowrite` | `{ todos: { content; status }[] }` | 任务清单状态机整表替换；驱动状态栏与执行面板；Plan/Review 模式下被硬拦截 |
| **语言服务** | `lsp` | `{ operation; filePath; line?; character?; query? }` | 9 种 LSP 语义操作：`goToDefinition` / `findReferences` / `hover` / `documentSymbol` / `workspaceSymbol` / `goToImplementation` / `prepareCallHierarchy` / `incomingCalls` / `outgoingCalls`；支持懒安装 |
| **交互与协作** | `question` | `{ questions: { question; header; options; multiple? }[] }` | 向用户发起结构化交互式提问（支持 Markdown 与选项选择） |
| | `task` | `{ description; prompt; agent_type?; name?; subagent_id? }` | 启动独立子代理或向 `SubagentPool` 续接；角色目录注入工具描述，工具集取父激活集与角色白名单交集，模型按 `role.model → defaultModel → 父模型` 覆盖，协作模式按 `agent.subagents.mode`（缺省 `build`，不继承主 Agent）绑定提示词与门禁；并发 `maxConcurrent` 超限快返，嵌套深度 `maxDepth` 1–5（详见 runtime.md §5） |
| | `read_skill` | `{ name }` | 读取并加载指定 Skill 指令包的完整 Markdown 正文 |
| **网络检索** | `web_search` | `{ query; numResults?=8; type? }` | 优先 Exa (mcp.exa.ai) 检索，Tavily (api.tavily.com) 兜底；`numResults` 上限 10 |
| | `webfetch` | `{ url; format?=markdown; timeout?=30s }` | URL 内容抓取与 HTML 转 Markdown，内置私网/Localhost SSRF 严格阻断 |
| **图像** | `view_image` | `{ path; detail?="high" }` | 本地图片查看（PNG/JPEG）：魔数探测 + 双路径预处理（≤4MiB 且未超限直传，否则缩放重编码；`high` 长边 ≤2048 / `original` ≤6000）；仅视觉模型注册（详见 §8） |

### 2.1 装配与能力快照 (`assembly.ts` / `capabilityService.ts`)

- `createRegistry(cwd, activeTools, mcpToolNames, withReadSkill, taskDeps?, questionDeps?, lspDeps?, sessionDeps?)` 注册内置全集；`lsp` / `question` / `task` 依赖对应 deps 存在才注册，`view_image` 依赖 `sessionDeps.supportsImages` 门控（非视觉模型不注册/不激活），MCP 工具仅注册白名单命中的已连接项，`read_skill` 由 Skill 激活状态决定。
- `setActive()` 按会话 `active_capabilities` 快照过滤，配置中引用的未注册工具（历史遗留）自动剔除。
- 能力快照随会话冻结，仅在能力集实际变化时追加 `active_capabilities` entry（见 architecture.md §8）。

**子代理角色目录**（运行时治理详见 [runtime.md](./runtime.md) §5）：

- 内置角色：`explorer`（只读白名单：`read` / `ls` / `grep` / `find` / `lsp` / `web_search` / `webfetch` / `time`）、`worker`（工具继承）；保留名不可被用户角色占用（`review` 归属协作模式 Review Mode，禁止子代理角色使用）。
- 用户角色：`~/.lx/config.json` → `agent.subagents.roles`，可声明 `description` / `instructions` / `model` / `tools`；`task` 工具描述在会话装配时动态注入角色目录。
- 能力只收缩不提权：子代理工具集 = 父激活集 ∩ 角色白名单，权限与沙箱继承父级；协作模式取 `agent.subagents.mode`（缺省 `build`）；并发上限与嵌套深度由会话级 `SubagentRuntime` 治理。

---

## 3. 动态提示词装配体系 (`SystemPromptManager`)

`src/main/agent/prompts/systemPromptManager.ts` 提供分段（Section）、运行时上下文（Context）、变量（Variable）与拦截器（Interceptor）四类注册点，按 order 升序装配；全局层与 `sessionId` 作用域层合并（同名 scoped 覆盖 global）：

```typescript
export const PROMPT_ORDERS = {
  IDENTITY: -100,               // 基础身份定义
  BEHAVIOR: -50,                // 通用行为规范（行为层基线）
  PERSONA: 0,                   // 人格（pragmatic / friendly）+ 核心操作规范
  MODEL_ADAPTIVE: 50,           // 模型自适应指令（按模型家族注入）
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
  - 工具命名自动规整为 `sanitize(serverName)_sanitize(toolName)`（`mcp__` 命名空间），避免与内置工具冲突。
  - `jsonSchemaToZod` 动态将 JSON Schema 转换为运行时 Zod 校验器，无法无损解析的高级 Schema 降级为宽松 Record 透传。
  - 每次会话装配按能力快照中的 MCP 白名单包装注册（`wrapMcpTool`），未连接或未授权工具不进入工具集；MCP 工具始终走审批门控，不因名称进入豁免/默认放行（见 permissions.md §5.1）。

---

## 5. Skill 指令包体系 (`src/main/agent/skills/`)

Skill 作为领域级指令包，遵循标准 Markdown 组织格式并具备扩展配置与双轨调用能力：

### 5.1 目录发现三层优先级

加载器扫描三层目录并按照优先级去重覆盖（高优先级同名覆盖）：

1. **用户全局级**：`~/.lx/skills/<name>/SKILL.md`（或直接 `.md` 文件，最高优先级）
2. **项目私有级**：`<cwd>/.lx/skills/<name>/SKILL.md`
3. **标准通用级**：`<cwd>/.agents/skills/<name>/SKILL.md`（跨客户端通用目录）

### 5.2 双轨调用机制 (Dual-Track Paradigm)

- **显式提及 / 零轮注入 (Zero-Round Injection)**：
  - 用户在输入框中通过 `$` 快捷唤出面板插入 `$skill-name`（或兼容历史 `/skill:name`）；`@` 提及面板输入 `@skill` / `@skill:` 可检索并插入同一语法。
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

- **双入口触发与补全**：`@` 综合提及面板（聚合 Skills / 项目文件 / 子代理角色 / 设计卡片，Skill 项置顶并标注 `Skill` 标签）与 `$` 专属技能面板；均支持光标跟随定位、键盘导航与回车补全。
- 文案统一接入 i18n 字典（`agent.skillMention` 等命名空间）。

---

## 6. Slash 命令模板 (`promptTemplateLoader.ts`)

- 模板来源：`~/.lx/prompts/*.md`（用户级）与 `<cwd>/.lx/prompts/*.md`（项目级），frontmatter 声明 `description` 与 `argument-hint`。
- 内置保留命令（`RESERVED_COMMANDS`：`clear` / `new` / `undo` / `steer` / `model` / `gitWorktree` / `compact` / `export` 等）与 `skill:` 前缀不允许被模板覆盖。
- 模板以 UserMessage 的 `command` 元数据标记来源，执行流程面板据此展示指令来源徽标。

---

## 7. 生命周期钩子（Lifecycle Hooks）

工具执行前后的治理扩展点（`PreToolUse` / `PostToolUse` / `PermissionRequest`）以及会话、压缩、子代理等生命周期事件，统一由用户级 hook 体系提供。

### 7.1 架构与语义

```text
~/.lx/config.json → agent.hooks
        │
        ▼
hookConfig（zod 校验 + matcher 解析 + 会话级缓存）
        │
        ▼
hooksManager.dispatch（串行派发，配置顺序即执行顺序）
        │
        ├─ commandRunner：一次性子进程（stdin JSON / LX_* env / 超时杀进程树 / 输出 1MB 截断）
        ├─ outputParser：严格 JSON 解析 + 决策归一
        └─ HookRunResult：每个 hook 独立产生一条 HookContextMessage
                 │
                 ├─ FlowList：hook 步骤（含 failed / blocked 审计）
                 ├─ agent.state.messages → 非空 text 映射为 <hook_context> user 消息
                 └─ 调用点效果合并：阻断工具 / 单次审批 / 拒绝提交
```

- V1 仅支持 `command` handler；配置来源仅用户级 `~/.lx/config.json` 的 `agent.hooks`，无项目级、无热重载；亦可在 设置 → 钩子 中可视化增删改（保存后仅对新会话生效，运行中会话沿用旧配置）。
- 所有执行失败（spawn 失败 / 超时 / 非零退出 / 伪 JSON）一律 **fail-open**；阻断只能来自成功执行且显式声明的信号。
- hook 运行产物为 `HookContextMessage`（role `hookContext`）：非空 `text` 注入模型上下文，同时驱动执行流展示；不进入消息列表（MsgList）分组。

### 7.2 事件矩阵

| 事件 | 触发挂点 | 效果 |
|------|----------|------|
| `SessionStart` | `sessionRunner.runOne`（每会话一次） | `additionalContext` 注入本轮首发前 |
| `UserPromptSubmit` | `sessionRunner.runOne`（每次提交） | `additionalContext` 注入用户消息前；`continue:false` 拒绝提交 |
| `PreToolUse` | `agent-loop.prepareToolCall`（权限解析后） | `exit 2 + stderr` 或 `decision:block` → 工具不执行，原因作为错误结果回灌 |
| `PermissionRequest` | `permissionManager.gate`（系统结论为 `ask`、弹 UI 前） | `allow` / `deny` 单次生效并替代 UI；失败/无决策回落 UI |
| `PostToolUse` | `agent-loop` 工具执行收尾 | `additionalContext` 紧跟工具结果注入 |
| `PreCompact` | `contextCompactor` 摘要生成前 | 永不阻断；输出仅审计展示 |
| `PostCompact` | 压缩成功后 | 永不阻断；输出仅审计展示 |
| `SubagentStart` | `task` 工具子代理启动 | `additionalContext` 仅注入子代理自身上下文；payload `agent_type` 为解析后的角色名 |
| `SubagentStop` | 子代理结束（成功/失败/中止） | 状态审计（`done` / `error` / `aborted`） |
| `Stop` | agent 正常停止前（`agent-loop`） | 通知与审计；不引入阻止停止语义 |
| `SessionEnd` | `agentRunner.deleteSession` / `app.will-quit` | best-effort（3s 超时），不等待异步工作 |

### 7.3 配置 schema（`~/.lx/config.json` → `agent.hooks`）

```jsonc
{
  "agent": {
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "bash|edit|write",
          "hooks": [
            {
              "name": "block-rm-rf",
              "type": "command",
              "command": "~/.lx/hooks/block-rm.sh",
              "commandWindows": "powershell -File C:\\hooks\\block-rm.ps1",
              "timeout": 30,
              "additionalContextLimit": 2500
            }
          ]
        }
      ]
    }
  }
}
```

- 事件键为 PascalCase 精确名；未知键告警并忽略。
- `matcher`：`"a|b|c"` 竖线分隔的精确工具名（非正则），缺省 = 全部；仅 `PreToolUse` / `PostToolUse` / `PermissionRequest` 使用。
- `command` 必填（`type` 缺省即 `command`）；`commandWindows` 在 win32 优先。
- `timeout` 秒，默认 600，下限 1；`additionalContextLimit`：注入模型上下文的 additionalContext 上限（按 token 估算，默认 2500），超限截断并附截断标记，`0` 表示不注入 additionalContext。
- 非法条目（结构错误 / 未知 handler 类型 / 空命令）→ 警告 + 忽略该条，不阻断会话启动。
- 读写通道：`settings:hooks:get/save`（`settingsService` 保存后仅清 `global` 缓存）；设置页组件 `HooksSettings.tsx`。

### 7.4 线协议（外部 CLI 生态兼容）

stdin（snake_case，JSON 写入后关闭）：

```jsonc
{
  "session_id": "…",
  "turn_id": "…",
  "cwd": "/abs/path",
  "hook_event_name": "PreToolUse",
  "model": "…",
  "permission_mode": "default",
  "tool_name": "bash",
  "tool_input": { "command": "…" },
  "tool_use_id": "call_…"
}
```

stdout（camelCase 严格 JSON，允许为空）：

```jsonc
{
  "continue": true,
  "stopReason": "…",
  "suppressOutput": false,
  "systemMessage": "…",
  "decision": "block",
  "reason": "…",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "…",
    "decision": { "behavior": "allow", "message": "…" }
  }
}
```

子进程环境注入 `LX_SESSION_ID` / `LX_HOOK_EVENT` / `LX_HOOK_NAME` / `LX_CWD`。

### 7.5 安全边界

1. 仅用户级配置，信任级别等于用户自己开终端；不引入项目级 hooks（避免 clone 即执行供应链风险）。
2. 执行隔离：一次性子进程 + 超时杀进程树 + stdout/stderr 1MB 硬顶。
3. `PermissionRequest` 失败绝不升级为放行；Guardian `deny` / deny 规则 / 沙箱只读不可被 hook 覆盖。
4. hook 无永久规则写入能力，每次决定均产生审计消息。

---

## 8. view_image 图片查看与投递管道

`view_image` 让模型直接查看项目内本地图片，覆盖 Front Design 产出审查、报错截图定位、设计稿/图表解读三类场景；对齐主流 CLI agent 的本地图片查看能力。

### 8.1 工具契约 (`src/main/agent/tools/viewImage.ts`)

| 项 | 值 |
| :--- | :--- |
| `name` | `view_image` |
| `label` | `View image` |
| `executionMode` | `parallel`（纯只读，无副作用） |
| 参数 | `{ path: string; detail?: "high" \| "original" }` |
| 返回 content | `[{ type: "text", text: 摘要 }, { type: "image", mimeType, data: base64 }]` |
| 返回 details | `{ image: ViewImageDetails }` |

- 路径解析复用 `resolveToCwd(path, cwd)`，与 read/edit 等文件工具完全一致。
- 摘要文本（英文）包含：绝对路径、`detail`、原图尺寸、发送尺寸、是否重编码。
- 错误语义：文件不存在 / 非文件 / 无法解码 / 超过硬上限 / 非视觉模型，均 `throw new Error(英文消息)`，由 agent-loop 统一封装为 `isError: true` 的工具结果回灌。

`ViewImageDetails`（`src/shared/contracts/agent/tools.ts`）：

```typescript
export interface ViewImageDetails {
  path: string          // 绝对路径（UI 经 lx-image://local 渲染）
  mimeType: string      // 实际发送给模型的 MIME
  detail: "high" | "original"
  width: number         // 发送尺寸
  height: number
  sourceWidth: number   // 原图尺寸
  sourceHeight: number
  resized: boolean      // 是否发生缩放/重编码
  sizeBytes: number     // 实际发送字节数
}
```

### 8.2 视觉能力门控

判定函数 `modelSupportsImageInput(provider, modelId)`（`src/main/agent/stream/modelCapabilities.ts`）：

1. 优先读 `getModelProviderSettings()` 中该模型 `modalities.input` 是否包含 `"image"`；
2. 配置缺失时回退关键词启发式：`gpt-4o` / `claude-3` / `gemini`。

双层门控：

- **装配时过滤**：`sessionRunner` 构建 Agent 时传入门控结果（`SessionToolDeps.supportsImages`），不支持图片的模型不注册、不激活 `view_image`。模型切换会触发 registry 重建，门控随之更新。
- **执行兜底**：工具 deps 注入 `supportsImages: () => boolean`，为 `false` 时抛 `view_image is not allowed because the current model does not support image inputs`（防装配缝隙）。

### 8.3 图片预处理

**格式探测与支持集**：按魔数（magic bytes）探测，不信任扩展名。支持集为 **PNG / JPEG**（Electron `nativeImage` 在 macOS 仅稳定解码这两种格式，已实测 GIF/BMP/WebP/AVIF 解码为空）；其余格式直接抛错并列出支持格式（`supported: PNG, JPEG`）。

**双路径策略**：

```text
MAX_DIMENSION_HIGH     = 2048   // detail=high 长边上限
MAX_DIMENSION_ORIGINAL = 6000   // detail=original 长边上限
MAX_PASSTHROUGH_BYTES  = 4 MiB  // 原字节直传上限
MAX_SOURCE_BYTES       = 20 MiB // 硬拒绝上限
JPEG_QUALITY           = 85
```

1. **直传路径**：文件 ≤ 4 MiB 且长边 ≤ 对应上限 → 原字节原样发送（`resized: false`，零重编码，保文字清晰度）；
2. **重编码路径**：需缩放或超过 4 MiB → `nativeImage` 解码、等比缩放到长边上限、按 PNG（无损）/ JPEG q85 编码（`resized: true`）；
3. 文件 > 20 MiB 或解码失败 → 抛错。

`nativeImage` 仅在 main 进程可用；单测通过 `vi.mock("electron")` 注入。

### 8.4 消息管道

- **契约扩展**：`ToolResultMessage` 新增可选字段 `image?: ViewImageDetails`（与 `diff` / `subagent` / `lsp` 同级）。`agent-loop.ts` 的 `createToolResultMessage` 从工具 details 提取并挂载，随 entry 完整落库（会话真相源，恢复无损）。
- **模型侧映射**（`toModelMessages.ts` 的 `toolResult` 分支）：
  - 工具结果一律以 `output: { type: "text", value }` 投递；
  - 结果含图片块时，在**整段连续工具结果之后**追加一条合并的 user 图片消息（`{ type: "image", image: dataURL }`），每张图片前带来源标签 `Image from tool "<name>" (<path>):`。并行工具调用会产生多条连续 tool 消息，必须全部输出完再追加图片消息（Provider 要求同一 assistant 消息的全部 tool 结果连续，否则报 `Tool result is missing for tool call ...`）。
  - 原因：AI SDK 对 `output.type === "content"` 的多模态工具结果，在 `openai`（Chat Completions）与 `openai-compatible` 路径会被 `JSON.stringify` 成纯文本（实测图片丢失）；tool 消息的数组 content 也会被网关拒绝。user 图片消息是各 Provider 一致支持的通路，且不进入应用会话历史，仅作用于每次请求的消息投影。
- **用户图片附件投影**：用户附图（`AgentUserMessage.files`）不内联 base64，`convertUserMessage` 对每张图片追加文本提示：

  ```text
  Attached image: <绝对路径> (use the view_image tool to inspect it)
  ```

  由模型按需调用 `view_image`（精度控制、历史修剪与调用审计统一收敛到该工具）。文本附件仍以 `<document>` 内联。该提示仅存在于每次请求的消息投影中，不落库、不进入 UI 与 `/undo` 回显。附件入口格式白名单收敛为 PNG/JPG/JPEG。

### 8.5 上下文治理与权限

- `view_image` 加入 `DEFAULT_PRUNABLE_TOOLS`；其图片块在尾部豁免窗口（默认 6 条消息）之外统一替换为文本占位 `[Image omitted from historical context: <path>]`（仅作用于投喂模型的内存副本，见 runtime.md §4.2）。
- `compaction.ts` 对 `image` 块按 `1500 tokens × 4` 等价字符数计入 token 估计，保证容量指示与压缩触发不失真。
- 权限：只读工具，加入 `EXEMPT_TOOLS`（见 permissions.md §5.2），永不触发审批。

### 8.6 UI 渲染

- **消息流**：`AgentToolCallBlock` 的 `view_image` 分支渲染 `AgentViewImageBlock`：缩略图（`lx-image://local` + `details.path`）+ 悬浮大图预览 + 文件名/尺寸/`detail` 标签；错误态回退文本。
- **工具名分类**：`view_image` 必须加入 `BUILTIN_UNDERSCORE_TOOLS`（`AgentMessageItem/constants.ts`），否则消息流会按 MCP 服务归组渲染。
- **执行流程**：`FlowToolViewImage` 由 `FlowItemToolContent` 按工具名分派；图片数据经 `executionFlow.ts` 从配对 toolResult 透传。
- **数据透传链**：`ToolResultMessage.image` → `ChatBlock.toolResult.image` → `utils.ts` 映射 → 上列渲染位点。
- **i18n 与主题**：新增文案（缩略图标签、detail 标签、尺寸/路径提示）同时写入 `zh.ts` / `en.ts`；样式沿用现有 CSS Token 与暗色体系。

### 8.7 已知限制与风险

| 风险 | 说明 | 缓解 |
| :--- | :--- | :--- |
| Provider 兼容性 | `openai`（Chat Completions）与 `openai-compatible` 会把多模态 tool result 序列化为纯文本 | 图片统一改写为工具结果后的 user 图片消息投递（§8.4） |
| 数据库体积 | 图片 base64 随 entry 落库 | 发送尺寸上限 2048/6000 + 重编码压缩约束单图体积 |
| 格式差异 | `nativeImage` 各平台解码能力不同 | 支持集收敛为 PNG/JPEG + 魔数探测 + 其他格式显式报错 |
| token 估算 | 固定 1500/张为启发式 | 仅影响容量指示与压缩触发时机 |
| 预览失效 | UI 预览依赖本地文件路径 | 源文件删除/移动后预览失效但布局不崩 |
