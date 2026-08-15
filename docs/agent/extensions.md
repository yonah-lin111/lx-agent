# 扩展点设计：工具 / MCP / Skill / 联网搜索

本文定义 LX Agent Agent 能力的扩展体系：内置工具契约、工具注册机制、MCP 工具与 Skill 的接入形态、联网搜索、任务清单。内置工具为对齐 pi coding-agent 的十四个：`read` / `ls` / `grep` / `find` / `write` / `edit` / `bash` / `time` / `todowrite` / `web_search` / `webfetch` / `task` / `question` / `lsp`；MCP 与 Skill 接入均已实现。

## 1. AgentTool 契约（对齐 pi）

```ts
import type { z } from "zod"

// 工具执行结果。content 是唯一回灌模型的内容；details 仅 UI/落库用，不进模型上下文。
interface AgentToolResult<TDetails = unknown> {
  content: (TextContent | ImageContent)[]
  details?: TDetails
  terminate?: boolean              // true = 提前终止工具循环
}

// 工具定义。
interface AgentTool<TParams extends z.ZodType = z.ZodType, TDetails = unknown> {
  name: string                     // 模型调用的名字，全注册表唯一
  label: string                    // UI 展示名
  description: string              // 模型理解用途的说明，写清楚参数语义
  inputSchema: TParams             // zod schema（v4）
  prepareArguments?: (args: unknown) => unknown   // 兼容旧格式参数（edit 使用）
  execute(
    toolCallId: string,
    params: z.infer<TParams>,
    signal?: AbortSignal,          // run 的 abort 信号，工具须配合取消
    onUpdate?: AgentToolUpdateCallback,   // 流式进度回调（可选）
  ): Promise<AgentToolResult<TDetails>>
  executionMode?: "sequential" | "parallel"     // 默认 parallel；副作用工具应声明 sequential
}
```

契约要点（与 pi 一致）：

- **参数校验失败不执行**：loop 在 `execute` 前 `safeParse`（`validateToolArguments`），失败产出 error toolResult 交回模型。
- **执行失败不中断 run**：`execute` 抛错 → error toolResult 回灌模型，模型自行重试/解释。
- **尊重 signal**：工具应监听 `signal` 并在取消时快速返回；abort 传播至 streamText 与工具。
- `terminate: true` 结束工具循环（不再续轮）。

## 2. ToolRegistry 与装配

```ts
interface ToolRegistry {
  register(tool: AgentTool): void            // 重名拒绝（抛错）
  getActive(): AgentTool[]                   // 当前激活集（进模型 tools 参数）
  setActive(names: string[]): void           // 按名激活；未知名忽略
  readonly cwd: string                       // 会话绑定目录
}
```

装配（`agentRunner.createRegistry(cwd, activeTools, mcpToolNames, withReadSkill, taskDeps?, questionDeps?, lspDeps?)`）：

- **注册全集，按能力集激活**：先注册全部内置工具（`read`/`ls`/`grep`/`find`/`write`/`edit`/`bash`/`time`/`todowrite`/`web_search`/`webfetch`/`task`/`question`/`lsp`）+ 已连接 MCP 工具（`wrapMcpTool`，仅命中 `activeMcp` 的注册）+ 条件注册 `read_skill`（存在可用 skill 时）；再 `setActive` 过滤 `ALL_TOOL_NAMES` + 实际注册的 MCP 全名 + `read_skill`。
- `ALL_TOOL_NAMES` = 内置十四工具（不含 `read_skill`，后者按 `withReadSkill` 单独处理）。
- cwd 来自会话冻结的项目目录（`freezeNewSession`，未设置时默认为系统桌面路径），工具创建时注入；路径类工具统一经 `resolveToCwd` 解析。
- 能力指纹（`activeCapabilities` + `activeMcp` + 注入 skill 名）任一变化即重建装配（`ensureReady` 内比对 `builtSignature`）。

## 3. 内置工具清单

| 工具 | 参数 schema | 说明 |
|------|-------------|------|
| `read` | `{ path: string; offset?: number; limit?: number }` | 读取文件。优先相对当前 cwd（当前目录）解析，不限制在项目目录内；`offset`/`limit` 行号分页（1 起始）；输出截断 `DEFAULT_MAX_LINES` 行或 `DEFAULT_MAX_BYTES` 字节；二进制返回文件信息 |
| `ls` | `{ path?: string; limit?: number }` | 列出目录条目。字母序（大小写不敏感）、目录加 `/` 后缀、含 dotfiles；默认 `limit=500`；超限注明 |
| `grep` | `{ pattern; path?; glob?; ignoreCase?; literal?; context?; limit? }` | 内容搜索。优先系统 `rg`，缺失降级纯 Node 正则扫描（均忽略 `node_modules`/`.git`）；默认 `limit=100`；单行超 `GREP_MAX_LINE_LENGTH` 截断 |
| `find` | `{ pattern; path?; limit? }` | glob 文件搜索。优先系统 `fd`，缺失降级纯 Node `readdir` 递归 + glob；默认 `limit=1000`；相对搜索根输出 |
| `write` | `{ path; content }` | 写入/覆盖 cwd 内文件，创建缺失父目录；经 `withFileMutationQueue` 串行化 |
| `edit` | `{ path; edits: { oldText; newText }[] }` | 精确文本替换。`prepareArguments` 兼容 `edits` 为 JSON 字符串或旧版 `oldText/newText` 顶层字段；BOM/CRLF 归一化；每个 `oldText` 须唯一且 edits 互不重叠（匹配原始内容，非增量）；成功返回 diff（`details.diff = generateStructuredDiff`）；经 `withFileMutationQueue` 串行化 |
| `bash` | `{ command; timeout? }` | **`executionMode: "sequential"`**。在 cwd 执行 shell 命令；默认超时 `120s`；stdout/stderr 合并流式回传，输出截断保留尾部（超 `DEFAULT_MAX_BYTES * 4` 停止累积）；超时/abort 终止整棵进程树（Unix 进程组负 pid / Windows `taskkill`）；cwd 不存在、非法 timeout → error toolResult |
| `time` | `{}` | 返回本机本地时间与时区，供模型感知时间上下文 |
| `todowrite` | `{ todos: { content; status }[] }` | 维护当前任务清单：**整表替换**（模型每次传完整 `todos` 数组，非增量）。纯会话状态（无文件/网络副作用），**不进权限门控集**；工具不碰持久化，由 runner 在 `tool_execution_end` 解析 `details.todos` 追加落 `todo` entry。多步任务自动建清单（DEFAULT_SYSTEM_PROMPT 指引）。详见 [TASKS-v4.md](./TASKS-v4.md) §2 |
| `web_search` | `{ query; numResults?; type? }` | 联网搜索公开互联网。Exa 优先、Tavily 兜底；Key 配于 `~/.lx/config.json` 的 `ai.webSearch`；无 Key 保留匿名直连。详见 §5 |
| `webfetch` | `{ url; format?; timeout? }` | 抓取 URL 原文（HTML→markdown/text）。仅 http/https 公网地址（私网阻断，独立于门控）；**进门控集**；5MB 响应上限；turndown + htmlparser2 转换；渲染并入 webSearch 分组。详见 §5.1 |
| `question` | `{ questions: { question; content?; header?; options?; multiSelect? }[] }` | 模型执行中向用户提问（选择题/自由文本，question 为纯文本提问，content 为可选 markdown 可含 mermaid，仅交互表单展示）。归**豁免集**；`executionMode: sequential`；消息流内联渲染（`AgentQuestionBlock`），答案经 `question_request` 事件 + `questionResponse` invoke 回灌。详见 [TASKS-v5.md](./TASKS-v5.md) §2 |
| `lsp` | `{ operation; filePath; line?; character?; query? }` | 基于语言服务器的语义检索（9 操作：goToDefinition/findReferences/hover/documentSymbol/workspaceSymbol/goToImplementation/prepareCallHierarchy/incomingCalls/outgoingCalls）。`line`/`character` 1-based（LSP 0-based 由工具层转换）；`workspaceSymbol` 需 `query`。仅 TS/JS/JSON/HTML/CSS/Python 配启动器（其余语言扩展名映射存在但报"无启动器"）；server 命令缺失（ENOENT）时**懒安装**（`npm install -g <包>`，按包并发去重）后重建 client 重试，安装失败回退手动安装提示。归**豁免集**；`executionMode: parallel`；结果落 `details`（`LspToolDetails`，含可点击跳转位置）随消息落库，渲染走 `AgentLspBlock`，点击经 `agent:openFileAt` 用系统编辑器打开。详见 [TASKS-v6.md](./TASKS-v6.md) |

说明：

- **路径解析**：所有涉及文件路径的工具统一经 `resolveToCwd` 解析，相对路径优先以当前目录 cwd 展开，但不限制在项目目录内，允许访问其它外部路径。
- **输出上限**：`DEFAULT_MAX_LINES = 2000`、`DEFAULT_MAX_BYTES = 50KB`、`GREP_MAX_LINE_LENGTH = 500`；超限结果注明截断。
- **bash 安全边界**：仅强制超时 + cwd 限制 + 进程树清理；执行前确认归 harness 信任模型（见 [harness.md](./harness.md) §3）。
- **grep/find 混合依赖**：优先系统 `rg`/`fd`（性能），缺失时降级纯 Node；不捆绑二进制，跨平台零部署成本。

## 4. 写并发控制：file-mutation-queue

`edit` / `write` 对**同一文件**的写操作经 `withFileMutationQueue` 串行化（不同文件仍并行），防止并发写互相覆盖；与 agent-loop 的 `executionMode` 正交：

- `withFileMutationQueue(filePath, fn)`：按文件 realpath 分桶，同 key 操作链式排队，先到先执行；无 ENOENT 时回退为 resolve 路径作为 key。
- 读工具（read/ls/grep/find）不排队——读的是磁盘最新状态，模型编排应保证"先写后读"顺序。
- `edit` 在 abort 时不主动 release queue：每次 `await` 后检查 `signal.aborted`，保持 queue 锁定到操作完成。

## 5. 联网搜索（web_search）

`web_search` 为只读联网工具（`src/main/agent/tools/webSearch.ts`）。

决策：

| # | 决策 | 结论 |
|---|------|------|
| 1 | Provider | **Exa 优先，Tavily 兜底**：同一搜索先试 Exa（`mcp.exa.ai` MCP），失败回退 Tavily（`api.tavily.com`）；固定顺序，不做轮询 |
| 2 | 无 Key 行为 | **保留匿名直连**：未配置 Key 仍发起请求（Exa 直连无认证参数、Tavily 无 Authorization 头）；匿名被拒（401/403）的 provider 在配置 Key 前**暂停重试**（`unavailableAnonymousProviders`），避免反复打无效服务 |
| 3 | 失败语义 | 可用 provider 全部失败抛**英文失败提示**（`Web search failed`，回灌模型 + 展示侧红色标注） |
| 4 | 配置位置 | `~/.lx/config.json` 的 **`ai.webSearch`** 节点（`exaApiKey` / `tavilyApiKey`） |
| 5 | 能力激活 | 进**内置工具全集**（`ALL_TOOL_NAMES`）：所有会话默认启用，无页面裁剪 |
| 6 | 渲染形态 | 专用块 **`AgentWebSearchBlock`**（`text-emerald-300` 独立配色），不参与普通工具折叠；连续多次搜索合并为 `[条件1], [条件2]` 单行展示，不展示搜索正文 |

```jsonc
// ~/.lx/config.json
{
  "ai": {
    "webSearch": {
      "exaApiKey": "exa-xxxx",     // 可选：Exa API Key（空则匿名直连）
      "tavilyApiKey": "tvly-xxxx"  // 可选：Tavily API Key（空则匿名直连）
    }
  }
}
```

工具契约：参数 `{ query: string(1..500); numResults?: number(1..10, 默认 8); type?: "auto"|"fast"|"deep"（默认 auto） }`；`executionMode: parallel`（只读无副作用）。`execute` 读取配置 → 归一化可用 provider 集（有 Key 或未被匿名拒绝）→ 固定先 Exa 后 Tavily → 命中返回文本观察（`content` 回灌模型，`details` 记 `query/numResults/type/provider`）。

渲染：连续同名 `web_search` 调用在 `AgentMessageItem` 归并为独立 `webSearch` 分组；全失败时头部追加红色 `· Web search failed`。

## 5.1 原文抓取（webfetch）

`webfetch` 为只读联网工具（`src/main/agent/tools/webfetch.ts`），补 web_search「只能搜不能拉原文」的空缺。

决策：

| # | 决策 | 结论 |
|---|------|------|
| 1 | 参数 | `{ url: string(必须 http/https); format?: "text"\|"markdown"\|"html"(默认 markdown); timeout?: number(默认 30s，上限 120s) }` |
| 2 | 权限 | **进门控集** `GATED_BUILTIN_TOOLS`（首次 fetch 弹窗确认，可永久允许/永久拒绝，参数匹配 `WebFetch(url)` 前缀） |
| 3 | SSRF 防护 | **默认阻断私网/localhost/内网地址**（解析 URL host，命中 `0.*`/`10.*`/`100.64-127.*`(CGNAT)/`127.*`/`169.254.*`/`172.16-31.*`/`192.168.*`/`198.18-19.*`/`::1`/`localhost` 拒绝），阻断独立于门控（即使放行也不发私网请求） |
| 4 | 响应上限 | 5MB 上限；超限抛错 |
| 5 | HTML 转换 | `turndown`（HTML→markdown）+ `htmlparser2`（HTML→纯文本）；markdown/纯文本 content-type 原样返回 |
| 6 | 输出形态 | `content` = 转换后文本（经 `truncate.ts` 有界）；`details` 记 `{ url, format, contentType, provider: "webfetch" }` |
| 7 | 渲染 | 并入 webSearch 分组（同属"联网"语义） |

工具契约：`executionMode: parallel`（只读无副作用）。`execute` 校验 url scheme → SSRF host 校验 → `fetch`（timeout + run abort 级联）→ content-type 分派 → turndown/htmlparser2 转换 → `truncate.ts` 有界 → 返回。失败语义：门控拒绝/网络失败/超时/超限 → error toolResult 回灌模型；匿名直连（无认证）。

## 6. MCP 工具接入

接入逻辑参考 opencode 的 `packages/opencode/src/mcp/`；仅 **local stdio**（spawn 子进程 + stdio 协议），remote / OAuth 留口（见 §6.5）。

### 6.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 传输 | **仅 local stdio**；无 HTTP / SSE / OAuth |
| 2 | 配置位置 | `~/.lx/config.json` 的 **`agent.mcp`** 节点 |
| 3 | 启用策略 | **配置即启用**：连上的 server 工具全部进激活集（无页面/项目裁剪） |
| 4 | 命名 | MCP 工具**一律前缀化** `sanitize(server)_sanitize(tool)`（`sanitize = value.replace(/[^a-zA-Z0-9_-]/g, "_")`），防与内置工具/跨 server 冲突 |
| 5 | 失败语义 | 单 server 连接失败**降级不阻塞**：记 failed 状态，其工具不进注册表，其余照常 |
| 6 | 会话快照 | 恢复历史会话时**按当前配置重载**；快照 `mcp[]` 仅展示/校验 |

### 6.2 配置 schema

```jsonc
// ~/.lx/config.json
{
  "ai": { /* 模型 provider 配置不变 */ },
  "agent": {
    "mcp": {
      "codegraph": {
        "command": ["codegraph", "serve", "--mcp"],   // 必填：可执行命令 + 参数
        "cwd": "/abs/or/relative",                    // 可选：server 进程工作目录
        "environment": { "KEY": "value" },            // 可选：附加环境变量（合并到 process.env）
        "disabled": false,                            // 可选：显式停用
        "timeout": 30000                              // 可选：连接初始化超时（ms），默认 30000
      }
    }
  }
}
```

`mcpManager.getServers()` 读取（`disabled` / 缺 `command` / 非法条目跳过并记警告）。

### 6.3 连接与生命周期（`src/main/agent/mcp/mcpManager.ts`）

进程内单例 `McpManager`，状态 `Map<serverName, {status, tools, error?, client?, timeout}>`：

| 生命周期 | 行为 |
|----------|------|
| 初始化 | `getServers()` 读 `agent.mcp`；`ensureConnected()` 幂等（并发调用共享同一次连接） |
| 连接 | `connectAll()` 逐 server 并发：`StdioClientTransport({ command, args, cwd, env })` → `client.connect(timeout)` |
| 列工具 | `listTools` 分页拉全（`nextCursor` 循环，上限 1000 页、游标去重；失败按空） |
| 监听 | `client.setRequestHandler(ToolListChangedNotification)` → 重拉工具；`client.onclose` → failed |
| 状态 | `connected` / `disabled` / `failed(error)`；`getStatus()` 快照；`onStatusChange(listener)` 订阅（渲染层状态 icon 刷新）；连接状态变更经 `mcp_status_changed` 事件推送到 renderer |
| 断开 | `disconnectAll()`：close 全部 client（SDK 终止子进程），挂 `app.on('will-quit')` |

工具缓存：`getTools(): McpToolHandle[]`（`{ server, def, client, timeout, fullName }`，仅 connected）。

### 6.4 工具适配（MCP → AgentTool）

```ts
function wrapMcpTool(server, def, client, timeout): AgentTool<any> {
  return {
    name: mcpToolName(server, def.name),      // 前缀化，防冲突
    label: def.name,
    description: def.description ?? "",
    inputSchema: jsonSchemaToZod(def.inputSchema),   // JSON Schema → zod；无法无损转换降级宽松
    executionMode: "sequential",                     // MCP 工具视为有副作用，串行
    execute: async (_toolCallId, params, signal) => {
      const result = await client.callTool(
        { name: def.name, arguments: params },
        CallToolResultSchema,
        { signal, timeout, resetTimeoutOnProgress: true, onprogress: () => {} },
      )
      if (result.isError) throw new Error(contentToText(result.content) || `MCP 工具 ${def.name} 执行失败`)
      if (result.content.length > 0 || result.structuredContent == null)
        return { content: [{ type: "text", text: contentToText(result.content) }] }
      return { content: [{ type: "text", text: JSON.stringify(result.structuredContent) }] }  // structuredContent 兜底
    },
  }
}
```

schema 转换 `jsonSchemaToZod`（`src/main/agent/mcp/jsonSchemaToZod.ts`）：

- 递归支持 `object`（properties/required）、`string`/`number`/`integer`/`boolean`/`null`、`array`、`enum`（全字符串 → `z.enum`，单值 → `z.literal`，混合降级）、`anyOf`（仅承载类型的分支按替代类型联合；忽略仅含 `required` 等约束的片段）。
- 无法无损转换（`oneOf`、自引用 `$ref`、未知 type）→ 降级 `z.record(z.string(), z.unknown())`，运行时透传。
- 对齐 opencode `convertTool` 的 `type: "object"` + `additionalProperties: false` 约束；zod v4 提供 `z.toJSONSchema`，反向转换自实现。

### 6.5 演进留口（v2+）

- **remote / OAuth**：`config.mcp` 支持 `{ type: "remote", url, headers?, oauth? }`，需要 token 存储 + 回调端口 + `needs_auth` 状态机。当前无 OAuth 基建，v1 不做。
- **MCP 状态 UI**：`getStatus()` / `mcp_status_changed` 已暴露，后续 `/` 命令面板可加 `mcp status`。
- **权限门控**：敏感 MCP 工具确认流程已挂 `beforeToolCall`（见 [harness.md](./harness.md) §3 信任模型）。

## 7. Skill 接入

Skill = 可复用指令包（system prompt 片段 + 可选工具集 + 可选上下文注入）。接入逻辑参考 pi 的 `packages/coding-agent/src/core/skills.ts` 与 `agent-session.ts`；**skill 的编写格式对齐 pi**。

### 7.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 来源 | **user 级 `~/.lx/skills` + 项目级 `<cwd>/.lx/skills`** 双来源；同名冲突 **user 优先**（project 记诊断）；同一物理文件（realpath 相同）跳过不记冲突 |
| 2 | 注入方式 | systemPrompt 只放 skill 的 **name + description**（XML `available_skills` 块，`formatSkillsForPrompt`）；正文由专用 **`read_skill(name)`** 工具按需读取 |
| 3 | `read_skill` 边界 | 只收 skill **name**（加载器查表解析路径），**不收路径参数**——天然豁免 cwd 限制，无需碰 `resolveToCwd` |
| 4 | 触发 | **模型自主**（命中描述调 `read_skill`）+ **显式 `/skill:<name> args`**（main 侧展开正文）；`disable-model-invocation` 的 skill 仅显式可用 |
| 5 | 注入上限 | 单次注入最多 **50** 个 skill（按 name 排序取前 50）；单条 description 截断 1024 字符 |
| 6 | 激活绑定 | 存在 ≥1 个可用 skill 时，`read_skill` **强制进激活集**（prompt 承诺了它就必须在） |
| 7 | 会话快照 | 恢复历史会话时 skill **按当前配置重载**；快照 `skills[]` 仅展示/校验 |

### 7.2 Skill 编写格式（对齐 pi）

```
~/.lx/skills/
  my-skill/
    SKILL.md        # skill 根：目录含 SKILL.md 即 skill，不再递归
    assets/...      # 可选：正文引用的相对资源
```

`SKILL.md` 头：

```markdown
---
name: my-skill          # 可选：缺省用目录名；校验：小写 a-z0-9 连字符、≤64、首尾非连字符、无连续连字符
description: 一句话说明用途（必填，≤1024），用于模型判断何时触发
disable-model-invocation: false   # 可选：true = 禁止模型自主触发，仅 /skill:<name> 显式调用
---

正文……（模型按需读入的完整指令；正文内相对路径以 skill 目录为基准）
```

约束（与 pi 一致）：

- **目录含 `SKILL.md` 即 skill 根，不再递归**；目录无 `SKILL.md` 时加载根目录直接 `.md` 子文件并继续递归子目录。
- `description` 缺失/为空 → 该 skill **不加载**（警告）；name/description 违规仅记警告仍加载。
- 跳过 `.` 开头条目与 `node_modules`；遵循 `.gitignore`/`.ignore`/`.fdignore`（`ignore` 包）。

### 7.3 加载器（`src/main/agent/skills/skillLoader.ts`）

进程内单例 `SkillLoader`，按会话 cwd 缓存 `Map<cwd, LoadedSkill[]>`（cwd 变化刷新）：

```ts
interface LoadedSkill {
  name: string
  description: string
  filePath: string
  baseDir: string            // 正文内相对路径基准（SKILL.md 所在目录）
  disableModelInvocation: boolean
}
```

`load(cwd)`：user（`getAppDataRoot()/skills`）+ project（`resolve(cwd)/.lx/skills`）合并，user 优先。另导出 `formatSkillsForPrompt(skills)`（拼 `available_skills` XML 块）与 `stripFrontmatter(content)`。

### 7.4 注入（systemPrompt 拼接）

skill 的 name+description 块拼在 `DEFAULT_SYSTEM_PROMPT` 之后，**Agent 创建时一次性拼好**（非每轮 `transformContext`）。对齐 pi `formatSkillsForPrompt`：

```
\n\nThe following skills provide specialized instructions for specific tasks.
Use the read_skill tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md) and use that absolute path in tool commands.

<available_skills>
  <skill>
    <name>my-skill</name>
    <description>…</description>
    <location>…/SKILL.md</location>
  </skill>
</available_skills>
```

规则：`disableModelInvocation=true` 不进 prompt；上限 50（按 name 排序取前 50）；description 截断 1024；只要加载到 ≥1 个可用 skill，`read_skill` 就注册并进激活集。

### 7.5 `read_skill` 工具（`src/main/agent/skills/readSkillTool.ts`）

| 字段 | 值 |
|------|----|
| `name` | `read_skill` |
| `inputSchema` | `{ name: z.string() }`（**仅 skill name，不接受路径**） |
| `execute` | 查 `skillLoader.get(name)`；未命中 → 返回错误 toolResult（列可用名）；命中 → 返回 strip frontmatter 后的正文，注明 `baseDir`，经 `truncate.ts` 截断 |

工具本体不含任何路径参数，路径解析完全走加载器白名单——不触碰 `resolveToCwd`，无需豁免。

### 7.6 显式触发（/skill:）

`agentRunner.send()` 入口 `_expandSkillCommand` 处理（对齐 pi `_expandSkillCommand`）：

```ts
// 输入 "/skill:name args"
// → 命中：正文块（strip frontmatter）以 <skill name location> 包裹 + "References are relative to {baseDir}."
//    args 非空时追加在块后
// → 未命中：原样透传（由模型自行解释）
```

- 展开在 **main 侧**（skill 文件读取在 main）；renderer 只透传原文。
- `/skill:` 显式调用对 `disable-model-invocation` 的 skill 同样生效。
- 后续 `/` 命令面板（UI 补全/展示）只碰 renderer，复用此展开逻辑，不改 main。

### 7.7 演进留口（v2+）

- **注入上限放宽/分页**：当前 50 上限硬编码（`MAX_INJECTED_SKILLS`）；后续可加设置项。
- **skill 附带工具集**：pi 的 skill 可携带可选工具；v1 仅正文指令，`tools` 关联留口。
- **命令面板**：`/skill:` 展开逻辑已就位，UI 补全为独立任务。

## 8. Hooks 位点汇总（扩展挂载点）

`AgentLoopConfig`（`core/types.ts`）暴露的全部钩子，均约定**不得 throw**：

| Hook | 时机 | 典型扩展 |
|------|------|----------|
| `convertToLlm`（必填） | 每轮请求前（AgentMessage → LlmMessage） | 自定义消息类型投射为 LLM 协议消息 |
| `transformContext` | 每轮请求前（AgentMessage 级） | 上下文裁剪、skill 注入、外部记忆 |
| `getApiKey` | 每次请求前 | 动态解析 provider API key |
| `beforeToolCall` | 工具执行前（参数校验后） | **权限确认（permissionManager.gate）**、MCP 允许列表、审计 |
| `afterToolCall` | 工具执行后（结果回灌前） | 结果改写、脱敏、terminate 提示 |
| `shouldStopAfterTurn` | turn 完成后 | 提前结束循环（如成本控制） |
| `prepareNextTurn` / `prepareNextTurnWithContext` | turn 结束、下一轮请求前 | 上下文/模型/思考级别切换（含 `setModel`） |
| `getSteeringMessages` | 工具循环暂停点 | 中途插入用户消息（pi steer 语义） |
| `getFollowUpMessages` | 模型将停止时 | 追加追问（pi followUp 语义） |
| `toolExecution` | 全局 | 工具执行模式（sequential / parallel） |
