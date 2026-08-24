# 工具与扩展体系

定义 Agent 的扩展面：内置工具契约与装配、MCP、Skill、instruction 指令文件、Prompt Templates（/命令模板）、联网搜索。工具全集见 `src/main/agent/assembly.ts` 的 `ALL_TOOL_NAMES`（17 个内置 + 条件注册的 `read_skill`）。

架构与 IPC 见 [architecture.md](./architecture.md)；权限门控见 [permissions.md](./permissions.md)；运行时行为见 [runtime.md](./runtime.md)。

## 1. AgentTool 契约

```ts
interface AgentToolResult<TDetails = unknown> {
  content: (TextContent | ImageContent)[]   // 唯一回灌模型的内容
  details?: TDetails                        // 仅 UI/落库用，不进模型上下文
  terminate?: boolean                       // true = 提前终止工具循环
}

interface AgentTool<TParams extends z.ZodType = z.ZodType, TDetails = unknown> {
  name: string                     // 模型调用名，注册表唯一
  label: string                    // UI 展示名
  description: string
  inputSchema: TParams             // zod v4
  prepareArguments?: (args: unknown) => unknown   // 兼容旧格式参数（edit 使用）
  execute(toolCallId, params, signal?, onUpdate?): Promise<AgentToolResult<TDetails>>
  executionMode?: "sequential" | "parallel"       // 默认 parallel；副作用工具声明 sequential
}
```

契约要点：

- **参数校验失败不执行**：loop 在 `execute` 前 `safeParse`（`validateToolArguments`），失败产出 error toolResult 交回模型。
- **执行失败不中断 run**：`execute` 抛错 → error toolResult 回灌，模型自行重试/解释。
- **尊重 signal**：abort 传播至 streamText 与所有工具，工具须快速返回。
- 所有 hooks 约定不得 throw。

## 2. ToolRegistry 与装配

```ts
interface ToolRegistry {
  register(tool: AgentTool): void            // 重名拒绝（抛错）
  getActive(): AgentTool[]                   // 当前激活集（进模型 tools 参数）
  setActive(names: string[]): void           // 按名激活；未知名忽略
  readonly cwd: string                       // 会话绑定目录
}
```

装配（`assembly.ts`）：

- 注册全集 = `ALL_TOOL_NAMES` 十七工具（`read` / `ls` / `grep` / `find` / `write` / `edit` / `bash` / `time` / `todowrite` / `web_search` / `webfetch` / `task` / `question` / `lsp` / `job_output` / `job_list` / `job_kill`）+ 已连接 MCP 包装工具（仅命中激活集的注册）+ 条件注册 `read_skill`（存在可用 skill 时）；再按能力快照 `setActive`。
- 能力不区分页面：所有会话一律全量能力；能力指纹变化才重建装配（比对 builtSignature）。
- cwd 来自会话冻结值（新会话取最近更新的 filesystem 项目目录，无项目时回退桌面路径），工具创建时注入；路径类工具统一经 `resolveToCwd` 解析——相对路径以 cwd 展开，但**不限制在项目目录内**。

## 3. 内置工具清单

| 工具 | 参数要点 | 说明 |
|------|----------|------|
| `read` | `{ path; offset?; limit? }` | 读文件，行号分页（1 起始）；超限截断；二进制返回文件信息 |
| `ls` | `{ path?; limit?=500 }` | 列目录，字母序、目录加 `/`、含 dotfiles |
| `grep` | `{ pattern; path?; glob?; ignoreCase?; literal?; context?; limit?=100 }` | 内容搜索：优先系统 `rg`，缺失降级纯 Node 扫描；忽略 node_modules/.git |
| `find` | `{ pattern; path?; limit?=1000 }` | glob 文件搜索：优先 `fd`，降级 readdir + glob |
| `write` | `{ path; content }` | 写入/覆盖文件，自动建父目录；经 file-mutation-queue 串行化 |
| `edit` | `{ path; edits: { oldText; newText }[] }` | 精确替换：BOM/CRLF 归一化、oldText 唯一且 edits 不重叠；成功返回结构化 diff；串行化；写后 LSP 自动诊断（见 runtime.md §7） |
| `bash` | `{ command; timeout?=120s; background? }` | cwd 内执行 shell；进程树超时清理；`background: true` 转 jobRegistry 后台作业（见 runtime.md §8） |
| `time` | `{}` | 本机时间与时区 |
| `todowrite` | `{ todos: { content; status }[] }` | 任务清单整表替换；纯会话状态不进门控；runner 落 `todo` entry |
| `web_search` | `{ query; numResults?=8; type? }` | Exa 优先 Tavily 兜底（§6） |
| `webfetch` | `{ url; format?=markdown; timeout?=30s≤120s }` | URL 原文抓取：SSRF 私网阻断、5MB 上限、turndown/htmlparser2 转换；进门控集 |
| `question` | `{ questions[] }` | 模型向用户提问（选择/多选/自由文本，markdown+mermaid）；豁免集；sequential；答案经 questionManager 回灌 |
| `lsp` | `{ operation(9 种); filePath; line/character(1-based); query? }` | goToDefinition/findReferences/hover/documentSymbol/workspaceSymbol/goToImplementation/prepareCallHierarchy/incomingCalls/outgoingCalls；TS/JS/JSON/HTML/CSS/Python 配启动器，server 缺失懒安装（npm -g）后重试；豁免集；结果落 details 支持点击跳转 |
| `task` | `{ description; prompt; name? }` | 子代理委托（见 runtime.md §5） |
| `job_output` | `{ job_id; wait?; timeout_ms? }` | 消费后台任务增量输出（游标语义，可等待） |
| `job_list` | `{}` | 当前会话后台任务概览 |
| `job_kill` | `{ job_id; reason? }` | SIGTERM → 超时 SIGKILL 终止进程树 |
| `read_skill` | `{ name }` | 只收 skill name，加载器查表读正文；存在可用 skill 时强制进激活集 |

通用边界：

- 输出上限：`DEFAULT_MAX_LINES=2000`、`DEFAULT_MAX_BYTES=50KB`、grep 单行 500；超限部分经 spill 落盘并附路径提示（见 runtime.md §6）。
- grep/find 混合依赖：优先系统二进制，缺失降级纯 Node；不捆绑二进制。
- 写并发：`withFileMutationQueue` 按文件 realpath 分桶串行化 edit/write 同文件写，不同文件并行；读工具不排队。

## 4. Prompt Templates（/命令模板）

双来源 Markdown 模板：全局 `~/.lx/prompts/*.md` + 项目 `<cwd>/.lx/prompts/*.md`，同名**项目级覆盖全局级**。实现：`prompts/promptTemplateLoader.ts`（单例 `promptTemplateLoader`）。

```markdown
---
description: 审查指定文件的代码质量   # ≤60 字符，命令面板展示
argument-hint: [target_file]          # 参数提示（缺省由正文占位符推断）
---
审查 $1 的代码质量，输出问题清单……
```

- 参数宏（`substituteArgs`）：`$1/$2…` 位置参数（`parseCommandArgs` 按 bash 风格引号解析）、`$@`/`$ARGUMENTS` 全部参数、`${N:-default}` 缺省值；未提供占位符展开为空串。
- 展开时机：main 侧 `send()` 入口展开为完整 prompt 再提交 agent；会话历史落盘展开后的有效 prompt，输入框保持短命令。
- Slash 动态补全（renderer）：`AgentInputCommandPanels` 聚合三类来源统一模糊匹配、扁平单列 + 来源 tag（内置 / 项目 / 全局 / Skill）：内置命令（`/clear` `/undo` `/steer` `/model` `/compact` `/export` `/copy` 等）、prompt 模板（回填后提示 argument-hint）、skill（回填 `/skill:<name> `）。模板清单经 `agent:listPromptTemplates` 拉取。

## 5. instruction 加载（AGENTS.md / CLAUDE.md）

- 来源与优先级：
  1. user 级 `~/.lx/AGENTS.md`
  2. 项目沿途 AGENTS.md（从 Git 仓库根目录到 cwd，由浅入深按顺序拼接注入，深层靠后生效；非 Git 仓库回退为仅读取 `<cwd>/AGENTS.md`）
  3. 根级 CLAUDE.md fallback（仅当项目沿途未找到任何 AGENTS.md 时在 cwd 尝试读取 `<cwd>/CLAUDE.md`）
- 子目录 AGENTS.md：沿途之外的子目录 AGENTS.md 不由 harness 自动预加载，在系统提示词通用行为层声明规范——触碰某子目录文件前模型应检查该子树下的 AGENTS.md（经 `read` 工具读取）。
- 注入时机：会话装配时一次性拼入 system prompt（`Instructions from: <path>` 块）；cwd 冻结故无需每轮重读；子代理复用父 systemPrompt 自然继承。
- 失败语义：缺失/读取失败静默跳过；单文件读取截断防淹没上下文。

## 6. 联网搜索与抓取

### web_search（tools/webSearch.ts）

| 决策 | 结论 |
|------|------|
| Provider | **Exa 优先（mcp.exa.ai MCP），Tavily 兜底（api.tavily.com）**；固定顺序不做轮询 |
| 无 Key | 匿名直连；被拒（401/403）的 provider 暂停重试直至配置 Key |
| 失败 | 全部失败抛英文错误回灌模型，渲染侧红色标注 `· Web search failed` |
| 配置 | `~/.lx/config.json` → `ai.webSearch.exaApiKey / tavilyApiKey` |
| 渲染 | 连续调用合并为 `[条件1], [条件2]` 单行独立块，不展示正文 |

### webfetch（tools/webfetch.ts）

- SSRF 防护：解析 host，命中私网/localhost/CGNAT/link-local 一律拒绝；阻断独立于权限门控（即使放行也不发私网请求）。
- 5MB 响应上限；turndown（→markdown）+ htmlparser2（→text）；markdown/text content-type 原样返回。
- 进权限门控集，参数匹配 `WebFetch(url)` 前缀（见 permissions.md §4）。

## 7. MCP 接入（mcp/mcpManager.ts）

参考 opencode `packages/opencode/src/mcp/`；仅 **local stdio**。

配置（`~/.lx/config.json` → `agent.mcp`）：

```jsonc
{
  "agent": {
    "mcp": {
      "codegraph": {
        "command": ["codegraph", "serve", "--mcp"],  // 必填
        "cwd": "/abs/or/relative",                   // 可选
        "environment": { "KEY": "value" },           // 可选，合并 process.env
        "disabled": false,                           // 可选
        "timeout": 30000                             // 可选，连接初始化超时 ms
      }
    }
  }
}
```

生命周期：进程内单例，状态 `Map<server, {status, tools, error?, client?, timeout}>`；`ensureConnected()` 幂等（并发共享同一次连接）；逐 server 并发连接，`listTools` 分页拉全（上限 1000 页）；监听 `ToolListChangedNotification` 重拉、`onclose` 标 failed；单 server 失败**降级不阻塞**其余；连接状态变更推 `mcp_status_changed`；`disconnectAll()` 挂 `app.on("will-quit")`。

工具适配：

- 命名一律前缀化 `sanitize(server)_sanitize(tool)`，防冲突。
- `jsonSchemaToZod`：支持 object/primitive/array/enum/anyOf；无法无损转换（oneOf/$ref/未知 type）降级宽松 record 运行时透传。
- `executionMode: sequential`（视为有副作用）；全部 MCP 工具进权限门控集；调用记录 `kind='mcp'` + `mcp_server` 反查（见 database.md §3）。

## 8. Skill 接入（skills/skillLoader.ts）

Skill = 可复用指令包；格式对齐 pi。

```text
~/.lx/skills/<name>/SKILL.md        # user 级（同名优先）
<cwd>/.lx/skills/<name>/SKILL.md    # 项目级
```

```markdown
---
name: my-skill                        # 可选，缺省用目录名；小写 a-z0-9 连字符 ≤64
description: 一句话说明用途（必填 ≤1024）
disable-model-invocation: false       # true = 仅 /skill: 显式可用
---
正文……（相对路径以 skill 目录为基准）
```

机制：

- 目录含 `SKILL.md` 即 skill 根不再递归；description 缺失不加载；跳过 `.` 开头与 node_modules，遵循 ignore 系列。
- systemPrompt 只注入 name+description（XML `available_skills` 块，上限 50 个、描述截断 1024）；正文经 `read_skill(name)` 按需读取（strip frontmatter + 截断）。
- 触发：模型自主命中描述调用，或显式 `/skill:<name> args`（main 侧 `_expandSkillCommand` 展开正文块 + args）。
- 会话恢复时 skill 按当前配置重载；能力快照中的 `skills[]` 仅展示/校验。

## 9. Hooks 位点汇总

`AgentLoopConfig`（core/types.ts）暴露的全部钩子，是扩展的唯一挂载面：

| Hook | 时机 | 当前使用 |
|------|------|----------|
| `convertToLlm`（必填） | 每轮请求前 | AgentMessage → LlmMessage（含 todoState/compactionSummary 映射） |
| `transformContext` | 每轮请求前 | todo 注入、compaction 边界 + contextPruner 修剪 |
| `getApiKey` | 每次请求前 | provider key 解析 |
| `beforeToolCall` | 工具执行前 | permissionManager.gate + repeatToolGuard 守卫 |
| `afterToolCall` | 结果回灌前 | （留口：脱敏/改写） |
| `shouldStopAfterTurn` | turn 完成后 | 循环终止判定 |
| `prepareNextTurnWithContext` | 下一轮请求前 | 模型/上下文切换 |
| `getSteeringMessages` | 工具循环暂停点 | steer 队列 drain |
| `getFollowUpMessages` | 模型将停止时 | followUp 队列 |

## 10. 演进路线

| 方向 | 触发条件 | 留口位点 |
|------|----------|----------|
| MCP remote / OAuth | 出现远程 server 需求 | mcpManager 传输层可替换；需 token 存储 + 回调端口 |
| skill 附带工具集 | pi 语义 tools 关联需求 | LoadedSkill 结构可扩展 |
| 更多语言 LSP 启动器 | 用户语言诉求 | lsp/server.ts 启动器表登记即可 |
