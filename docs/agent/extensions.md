# 扩展点设计：工具 / MCP / Skill

本文定义 LX Agent Agent 能力的扩展体系：内置工具契约、工具注册机制、MCP 工具与 Skill 的接入形态。内置工具为对齐 pi coding-agent 的九个：`read` / `bash` / `edit` / `write` / `grep` / `find` / `ls` / `time` / `web_search`；MCP 与 Skill 接入已实现，细节分别见 [mcp.md](./mcp.md) 与 [skills.md](./skills.md)，联网搜索见 [websearch.md](./websearch.md)。

## 1. AgentTool 契约（对齐 pi）

```ts
import type { z } from "zod"

// 工具执行结果。
interface AgentToolResult<TDetails = unknown> {
  content: (TextContent | ImageContent)[]   // 回灌给模型的内容
  details?: TDetails                        // 结构化细节（UI/日志用，不进模型上下文）
}

// 工具定义。
interface AgentTool<TParams extends z.ZodType = z.ZodType, TDetails = unknown> {
  name: string                              // 模型调用的名字，全注册表唯一
  label: string                             // UI 展示名
  description: string                       // 模型理解用途的说明，写清楚参数语义
  inputSchema: TParams                      // zod schema（v4）
  prepareArguments?: (args: unknown) => unknown   // 兼容旧格式参数（可选）
  execute(
    toolCallId: string,
    params: z.infer<TParams>,
    signal?: AbortSignal,                   // run 的 abort 信号，工具须配合取消
    onUpdate?: AgentToolUpdateCallback,     // 流式进度回调（可选）
  ): Promise<AgentToolResult<TDetails>>
  executionMode?: "sequential" | "parallel" // 默认 parallel；副作用工具应声明 sequential
}
```

契约要点（与 pi 一致）：

- **参数校验失败不执行**：loop 在 `execute` 前 `safeParse`，失败产出 error toolResult 交回模型。
- **执行失败不中断 run**：`execute` 抛错 → error toolResult 回灌模型，模型自行重试/解释。
- **尊重 signal**：工具应监听 `signal` 并在取消时快速返回。
- `AgentToolResult.content` 是唯一回灌模型的内容；`details` 仅 UI 展示。

## 2. ToolRegistry

```ts
interface ToolRegistry {
  register(tool: AgentTool): void            // 重名拒绝（抛错）
  getActive(): AgentTool[]                   // 当前激活集（进模型 tools 参数）
  setActive(names: string[]): void           // 按名激活；未知名拒绝
  readonly cwd: string                       // 会话绑定目录
}
```

- 注册表随 runner 创建，cwd 来自当前激活项目目录（`selectProjectDirectory` 选择的目录）。
- 首版激活集固定为 `["read", "bash", "edit", "write", "grep", "find", "ls", "time"]`；`setActive` 为后续"工具开关/角色切换"预留。
- 新增内置工具：在 `src/main/agent/tools/` 下建文件 + 在 runner 装配处注册，两处改动即生效；skill 专用工具（`read_skill`）在 `src/main/agent/skills/` 下，同样在 runner 装配处注册。

## 2.1 写并发控制：file-mutation-queue

pi 中 `edit` / `write` 对**同一文件**的写操作经 `withFileMutationQueue` 串行化（不同文件仍并行），防止并发写互相覆盖。本移植保留该机制，与 agent-loop 的 `executionMode` 正交：

- 写工具默认仍为 `parallel` executionMode（与 pi 一致）；同文件写冲突由 queue 在 `execute` 内部串行。
- `withFileMutationQueue(filePath, fn)`：按文件 realpath 分桶，同 key 操作链式排队，先到先执行；无 ENOENT 时回退为 resolve 路径作为 key。
- 读工具（read/ls/grep/find）不排队——读的是磁盘最新状态，模型编排应保证"先写后读"顺序。

## 3. 内置工具清单

| 工具 | 参数 schema | 说明 |
|------|-------------|------|
| `read` | `{ path: string; offset?: number; limit?: number }` | 读取 cwd 内文件。相对路径解析，`..` 逃逸或绝对路径越界拒绝；`offset`/`limit` 支持按行号分页（1 起始）；输出截断 `DEFAULT_MAX_LINES` 行或 `DEFAULT_MAX_BYTES` 字节；二进制文件返回文件信息而非内容 |
| `ls` | `{ path?: string; limit?: number }` | 列出目录条目。按字母序（大小写不敏感）排序，目录加 `/` 后缀，含 dotfiles；默认 `limit=500`；字节超限截断并注明 |
| `grep` | `{ pattern: string; path?: string; glob?: string; ignoreCase?: boolean; literal?: boolean; context?: number; limit?: number }` | 按内容搜索。优先调系统 `rg`，缺失时降级纯 Node 逐文件正则扫描（两者均忽略 `node_modules`/`.git`）；默认 `limit=100` 匹配；单行超 `GREP_MAX_LINE_LENGTH` 截断 |
| `find` | `{ pattern: string; path?: string; limit?: number }` | 按 glob 模式搜索文件。优先调系统 `fd`，缺失时降级纯 Node `readdir` 递归 + glob 匹配；默认 `limit=1000`；相对搜索根输出 |
| `write` | `{ path: string; content: string }` | 写入/覆盖 cwd 内文件。创建缺失父目录；经 `withFileMutationQueue` 串行化 |
| `edit` | `{ path: string; edits: { oldText: string; newText: string }[] }` | 目标文本替换。每个 `oldText` 须在原文中唯一且 edits 互不重叠（匹配原始内容，非增量）；成功返回 diff；经 `withFileMutationQueue` 串行化 |
| `bash` | `{ command: string; timeout?: number }` | 在 cwd 执行 shell 命令。默认超时 `120s`（`timeout` 秒可覆盖）；stdout/stderr 合并流式回传，输出截断保留尾部；超时/abort 时终止整棵进程树（detached） |
| `time` | `{}` | 返回本机本地时间与时区，供模型感知时间上下文 |
| `web_search` | `{ query: string; numResults?: number; type?: string }` | 联网搜索公开互联网。Exa 优先、Tavily 兜底；Key 配于 `~/.lx/config.json` 的 `ai.webSearch`；无 Key 保留匿名直连。详见 [websearch.md](./websearch.md) |

说明：

- **路径安全**：所有涉及文件路径的工具统一经 `resolveToCwd` 解析，`..` 逃逸或绝对路径越界拒绝（与 `read` 一致）。
- **输出上限**：`DEFAULT_MAX_LINES = 2000`、`DEFAULT_MAX_BYTES = 50KB`、`GREP_MAX_LINE_LENGTH = 500`；超限结果注明截断。
- **bash 安全边界**：首版仅强制超时 + cwd 限制，无执行前确认；确认钩子（`beforeToolCall`）见 harness 信任模型演进。
- **grep/find 混合依赖**：优先系统 `rg`/`fd`（性能），缺失时降级纯 Node；不捆绑二进制，跨平台零部署成本。

## 3.1 联网搜索（web_search）

`web_search` 为只读联网工具：**Exa 优先、Tavily 兜底**，Key 配于 `~/.lx/config.json` 的 `ai.webSearch`（`exaApiKey` / `tavilyApiKey`），无 Key 保留匿名直连；可用 provider 全部失败抛英文失败提示。完整设计见 [websearch.md](./websearch.md)。

- **装配**：`agentRunner.createRegistry` 注册 + `ALL_TOOL_NAMES` 收录；`capabilityService` 的 `DEFAULT_ITEM_TOOLS` / `DEFAULT_PAGE_TOOLS` 默认激活，页面允许列表可裁剪。
- **渲染**：连续 `web_search` 调用在 `AgentMessageItem` 归并为独立分组，由 `AgentWebSearchBlock` 以 `text-emerald-300` 配色展示，仅列搜索条件（`[条件1], [条件2]`），不进入普通工具折叠组。

## 4. MCP 工具接入（已实现）

项目已依赖 `@modelcontextprotocol/sdk`，MCP 工具以 **Adapter 模式**包装为 `AgentTool`，无需改动 loop。完整设计见 [mcp.md](./mcp.md)。

```ts
// 伪代码：MCP tool → AgentTool 适配
function wrapMcpTool(server: McpClient, tool: McpToolDefinition, cwd: string): AgentTool {
  return {
    name: `${sanitize(server)}_${sanitize(tool.name)}`,   // 一律前缀化，防冲突
    label: tool.name,
    description: tool.description,
    inputSchema: jsonSchemaToZod(tool.inputSchema),   // 无法无损转换的 schema 降级宽松 schema
    execute: async (toolCallId, params, signal) => {
      const result = await server.callTool(tool.name, params, { signal })
      return { content: [{ type: "text", text: result.text }] }
    },
  }
}
```

接入形态（v1 已落地）：

1. **本地 stdio MCP server**（main 进程 spawn 子进程）：工具名冲突时前缀化（`<server>.<tool>`）；cwd 传入 server。
2. **MCP 工具允许列表**：item 会话配置即全量启用；`agent.pages[route].mcp` 允许列表覆盖页面会话。
3. **MCP hook 挂接**：敏感工具（写操作）经 `beforeToolCall` 走确认流程（见 harness.md 信任模型），v1 与内置工具一致无门控。

约束：MCP 工具 schema 是 JSON Schema，zod v4 提供 `z.toJSONSchema`/JSON schema 解析能力；无法无损转换的 schema（如 oneOf）降级为宽松 `z.record(z.unknown())` + 运行时透传。

## 5. Skill 接入（已实现）

Skill = 可复用指令包（system prompt 片段 + 可选工具集 + 可选上下文注入）。完整设计见 [skills.md](./skills.md)。

- **格式**：对齐 pi —— `<skill>/SKILL.md`（目录含 SKILL.md 即 skill 根），frontmatter 含 `name` / `description`（必填）/ `disable-model-invocation`；双来源 `~/.lx/skills`（user）+ `<cwd>/.lx/skills`（project），同名冲突 user 优先。
- **注入位点**：skill 的 `name + description`（XML `<available_skills>`）拼入 `Agent` 的 `systemPrompt`（创建时一次性拼接）。
- **按需读取**：专用内置工具 `read_skill(name)`（只收 skill name，加载器查表解析路径），模型命中描述时调用读入正文。
- **触发方式**：模型自主 `read_skill` + 显式 `/skill:<name> args`（`agentRunner.send` 入口展开）；`disable-model-invocation` 的 skill 仅显式可用。

## 6. Hooks 位点汇总（扩展挂载点）

| Hook | 时机 | 典型扩展 |
|------|------|----------|
| `beforeToolCall` | 工具执行前（参数校验后） | 权限确认、MCP 允许列表、审计 |
| `afterToolCall` | 工具执行后（结果回灌前） | 结果改写、脱敏、terminate 提示 |
| `transformContext` | 每轮请求前（AgentMessage 级） | 上下文裁剪、skill 注入、外部记忆 |
| `prepareNextTurn` | turn 结束、下一轮前 | 模型/thinking 切换（含 `setModel`） |
| `getSteeringMessages` | 工具循环暂停点 | 中途插入用户消息（pi steer 语义） |
| `getFollowUpMessages` | 模型将停止时 | 追加追问（pi followUp 语义） |
| `convertToLlm` | 发请求前的消息转换 | 自定义消息类型投射为 LLM 消息 |
