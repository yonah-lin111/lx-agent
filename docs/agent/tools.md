# 工具与扩展体系

本文档定义 LX Agent 的全部工具能力契约、装配机制、MCP 协议集成、Skill 指令包及系统提示词装配规范。

架构总览见 [architecture.md](./architecture.md)；安全门控见 [permissions.md](./permissions.md)；运行时管理见 [runtime.md](./runtime.md)。

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

| 工具分类 | 工具名称 | 参数签名 | 核心行为与特性 |
| :--- | :--- | :--- | :--- |
| **文件系统** | `read` | `{ path; offset?; limit? }` | 行号分页读取（1 起始），自动检测二进制文件；超限自动截断 |
| | `ls` | `{ path?; limit?=500 }` | 目录结构遍历，字母排序，包含隐藏文件，目录带 `/` 标识 |
| | `grep` | `{ pattern; path?; glob?; ignoreCase?; literal?; context?; limit?=100 }` | 内容正则搜索：优先使用系统 `rg`（ripgrep），缺失无缝降级纯 Node 遍历 |
| | `find` | `{ pattern; path?; limit?=1000 }` | 文件名匹配搜索：优先系统 `fd`，缺失降级为递归 readdir 模式匹配 |
| | `write` | `{ path; content }` | 文件全量写入/新建，自动创建父级目录；由 `file-mutation-queue` 串行化 |
| | `edit` | `{ path; edits: { oldText; newText }[] }` | 精确块替换：BOM/CRLF 归一化；生成行级结构化 Diff；联动写后 LSP 诊断 |
| | `apply_patch` | `{ patch: string }` | V4A 格式多文件原子补丁（Add/Update/Delete），全量前置校验，失败整体验回滚 |
| **执行与终端** | `bash` | `{ command; timeout?=120s; background?; session? }` | 通过 `UnifiedExecManager` 调度；支持 `background` 后台作业与 `session` PTY 持久会话 |
| | `job_output` | `{ job_id; wait?; timeout_ms? }` | 消费后台作业的增量输出流（带等待唤醒机制） |
| | `job_list` | `{}` | 查询当前会话内所有存活与已终结后台作业状态 |
| | `job_kill` | `{ job_id; reason? }` | 发送 SIGTERM 并在超时后升级 SIGKILL 终止目标进程树 |
| **系统与环境** | `time` | `{}` | 获取当前系统精确时间戳、本地格式化时间与时区 |
| | `switch_mode` | `{ mode: "default" \| "plan"; reason?: string }` | Agent 自主切换协作模式（如计划制定完毕后切回 Default 模式） |
| **记忆与规划** | `memory` | `{ action: "view" \| "save" \| "search" \| "delete"; topic?; name?; description?; type?; content?; query?; path? }` | Claude Code 风格项目分层记忆管理（`MEMORY.md` 索引与 Topic Notes） |
| | `todowrite` | `{ todos: { content; status: "pending" \| "in_progress" \| "completed" \| "cancelled" }[] }` | 任务清单状态机整表替换；驱动状态栏与执行面板 |
| **语言服务** | `lsp` | `{ operation; filePath; line; character; query? }` | 9 种 LSP 语义操作（定义跳转/引用查找/悬浮提示/符号搜索/调用层次等）；支持懒安装 |
| **交互与协作** | `question` | `{ questions: { question; header; options; multiple? }[] }` | 向用户发起结构化交互式提问（支持 Markdown 与选项选择） |
| | `task` | `{ description; prompt; name?; subagent_id? }` | 启动独立子代理或向 `SubagentPool` 中的既有子代理续接任务 |
| | `read_skill` | `{ name }` | 读取并加载指定 Skill 指令包的完整 Markdown 正文 |
| **网络检索** | `web_search` | `{ query; numResults?=8; type? }` | 优先 Exa (mcp.exa.ai) 检索，Tavily (api.tavily.com) 兜底 |
| | `webfetch` | `{ url; format?=markdown; timeout?=30s }` | URL 内容抓取与 HTML 转 Markdown，内置私网/Localhost SSRF 严格阻断 |

---

## 3. 动态提示词装配体系 (`SystemPromptManager`)

提示词装配引擎采用 8 层自适应架构：

```text
[Layer 0: Core Identity]         ──► 基础身份定义与极简/务实原则 (Pragmatic / Friendly)
[Layer 1: Collaboration Mode]    ──► Mode 模板 (Default 执行模式 vs Plan 只读规划模式)
[Layer 2: Model Adaptation]      ──► 模型自适应指令 (Codex / Claude / Generic 适配规则)
[Layer 3: Sandbox Constraints]   ──► 当前沙箱级别声明 (<sandbox_policy>)
[Layer 4: Time Reminder]         ──► 动态时间感知片段 (<current_time>)
[Layer 5: Workspace Memory]      ──► MEMORY.md 索引摘要注入 (MEMORY_SUMMARY)
[Layer 6: Project Instructions]  ──► 沿途 AGENTS.md 级联注入 (Git Root -> CWD 逐层继承)
[Layer 7: Capabilities & Tools]  ──► 激活工具集、MCP 工具与 Available Skills XML 声明
```

### 3.1 行为规范要点 (Behavior Harness)
- **Preamble 意图声明**：执行具有副作用（修改文件、执行终端命令、外发请求）的工具前，必须输出 1-2 句明确意图；普通连续只读操作保持静默。
- **手术刀式精准修改**：单点小修改优先使用 `edit`；多文件联动结构化变动优先使用 `apply_patch`；严禁全量无意义覆写。
- **Dirty Worktree 保护**：禁止未经用户明确同意执行 `git reset --hard`、`git checkout --` 等破坏性版本控制指令。
- **定向优先验证**：完成修改后优先运行受影响模块的轻量定向校验（如单测/Lint），严禁盲目跑全量庞大测试套件。

---

## 4. MCP 扩展集成 (`src/main/agent/mcp/`)

- **传输层标准**：当前采用标准本地 **Stdio MCP Server** 接入规范。
- **生命周期**：由 `McpManager` 单例统一管理，支持连接就绪等待、`ToolListChangedNotification` 动态热重载与退出级联清理。
- **命名空间与 Schema 映射**：
  - 工具命名自动规整为 `sanitize(serverName)_sanitize(toolName)`，彻底避免与内置工具冲突。
  - `jsonSchemaToZod` 动态将 JSON Schema 转换为运行时 Zod 校验器，无法无损解析的高级 Schema 降级为宽松 Record 透传。

---

## 5. Skill 指令包体系 (`src/main/agent/skills/`)

Skill 作为领域级指令包，遵循标准 Markdown 组织格式：
- **目录位置**：用户级 `~/.lx/skills/<name>/SKILL.md` 与项目级 `<cwd>/.lx/skills/<name>/SKILL.md`（项目级同名覆盖）。
- **两阶段加载**：
  1. 系统提示词初始化时，仅将 Skill 的 `name` 与 `description` 注入 `<available_skills>` 块（轻量占用上下文）。
  2. 当模型判断需要使用该技能时，主动调用 `read_skill(name)` 工具读取并执行正文指令。
