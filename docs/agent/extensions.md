# 扩展点设计：工具 / MCP / Skill

本文定义 LX Agent Agent 能力的扩展体系：内置工具契约、工具注册机制、未来 MCP 工具与 Skill 的接入形态。首版只实现 `read` / `time` 两个内置工具，其余为扩展留口。

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
- 首版激活集固定为 `["read", "time"]`；`setActive` 为后续"工具开关/角色切换"预留。
- 新增内置工具：在 `src/main/agent/tools/` 下建文件 + 在 runner 装配处注册，两处改动即生效。

## 3. 内置工具清单

| 工具 | 参数 schema | 说明 |
|------|-------------|------|
| `read` | `{ path: string }` | 读取 cwd 内文件。相对路径解析，`..` 逃逸或绝对路径越界拒绝；文本截断 100KB（超限注明"内容过长已截断"）；二进制文件返回文件信息而非内容 |
| `time` | `{}` | 返回 `new Date().toISOString()`，供模型感知当前时间 |

## 4. MCP 工具接入（后续）

项目已依赖 `@modelcontextprotocol/sdk`，MCP 工具将以 **Adapter 模式**包装为 `AgentTool`，无需改动 loop：

```ts
// 伪代码：MCP tool → AgentTool 适配
function wrapMcpTool(server: McpClient, tool: McpToolDefinition, cwd: string): AgentTool {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    inputSchema: jsonSchemaToZod(tool.inputSchema),   // 仅首版只读工具可用；参数未知时退化为宽松 schema
    execute: async (toolCallId, params, signal) => {
      const result = await server.callTool(tool.name, params, { signal })
      return { content: [{ type: "text", text: result.text }] }
    },
  }
}
```

接入形态（按演进顺序）：

1. **本地 stdio MCP server**（main 进程 spawn 子进程）：工具名冲突时前缀化（`<server>.<tool>`）；cwd 传入 server。
2. **MCP 工具允许列表**：仅显式允许的工具进入激活集，防止任意工具被模型调用。
3. **MCP hook 挂接**：敏感工具（写操作）经 `beforeToolCall` 走确认流程（见 harness.md 信任模型）。

约束：MCP 工具 schema 是 JSON Schema，zod v4 提供 `z.toJSONSchema`/JSON schema 解析能力；无法无损转换的 schema（如 oneOf）降级为宽松 `z.record(z.unknown())` + 运行时透传。

## 5. Skill 接入（后续）

Skill = 可复用指令包（system prompt 片段 + 可选工具集 + 可选上下文注入）。首版不实现，预留位点：

- **注入位点**：`AgentOptions` 的 `systemPrompt` 拼接 + `transformContext`（向上下文注入 skill 指令消息）。
- **注册形态**：skill 目录约定（如 `skills/<name>/SKILL.md` + `tools.ts`），加载器产出 `{ systemPromptFragment, tools }`，装配进 runner。
- **触发方式**：`Agent.promptFromTemplate` 位点（pi 语义）或用户消息前缀匹配，二选一，演进时定。

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
