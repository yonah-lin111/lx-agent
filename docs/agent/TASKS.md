# TASKS：MCP 与 Skill 接入

本文档是"将 MCP（参考 opencode）与 Skill（参考 pi）接入 lx-agent"的实现任务清单。设计决策见 [mcp.md](./mcp.md)、[skills.md](./skills.md)；本文件只列改动项、顺序与验收，供实现对照。

## 0. 范围

- **做**：MCP local stdio 工具接入（配置 `agent.mcp`）、Skill 接入（`~/.lx/skills` + `<cwd>/.lx/skills`、`read_skill`、`/skill:` 展开）、文档同步。
- **不做**：MCP remote/OAuth、权限确认弹窗、MCP/skill 状态 UI、`/` 命令面板（UI 补全）。

## 1. 前置（无代码改动）

- [ ] 在 `~/.lx/config.json` 的 `agent` 节点加入 `mcp`（示例见 mcp.md §2），`~/.lx/skills/` 放一个示例 skill 供验证。

## 2. 实现顺序

### Step 1：MCP 基础

- [x] `src/main/agent/mcp/jsonSchemaToZod.ts`：JSON Schema → zod 递归转换；无法转换降级 `z.record(z.unknown())`。
- [x] `src/main/agent/mcp/mcpManager.ts`：单例 `McpManager`。
  - `getServers()`：读 `agent.mcp`（`disabled` / 非法条目跳过）。
  - `connectAll()`：逐 server `StdioClientTransport` → `client.connect(timeout)` → 分页 `listTools`（上限 1000 页、游标去重、失败按空）。
  - 状态 `Record<name, {status, tools, error?}>`；失败记日志不抛。
  - `watch`：`onclose` → failed；`ToolListChanged` → 重拉工具。
  - `disconnectAll()`：close transport，挂 `app.on('will-quit')`（index.ts 装配）。
  - `getTools(): McpToolHandle[]`（仅 connected）。

### Step 2：MCP 工具适配

- [x] `wrapMcpTool(server, def, client, timeout): AgentTool`（见 mcp.md §4，落在 mcpManager.ts）：
  - name = `sanitize(server)_sanitize(def.name)`，`sanitize = value.replace(/[^a-zA-Z0-9_-]/g, "_")`。
  - `execute`：`client.callTool({name, arguments}, CallToolResultSchema, {signal, timeout, resetTimeoutOnProgress: true, onprogress: () => {}})`；isError → throw；`structuredContent` 兜底 JSON 序列化。
  - `executionMode: "sequential"`。

### Step 3：skill 加载

- [x] `src/main/agent/skills/skillLoader.ts`：单例，`load(cwd)` / `get(name, cwd)`。
  - 对齐 pi `loadSkillsFromDir` 语义：SKILL.md 根约定、frontmatter 解析（name/description 必填/disable-model-invocation）、名称校验、跳过 `.`/`node_modules`、ignore 文件。
  - 双来源 `~/.lx/skills`（user）+ `<cwd>/.lx/skills`（project），同名冲突 **user 优先**。
  - 缓存：cwd 变化时刷新。

### Step 4：skill 注入与 read_skill

- [x] `src/main/agent/skills/readSkillTool.ts`：`read_skill` 工具（`{ name: z.string() }`，查表读正文，strip frontmatter，注明 baseDir，`truncate.ts` 截断）。
- [x] `agentRunner.ensureReady()`：
  - `skillLoader.load(cwd)` → 拼 `formatSkillsForPrompt` XML 块（上限 50、description 截断 1024、跳过 disable-model-invocation）追加到 `DEFAULT_SYSTEM_PROMPT`。
  - 有 ≥1 可用 skill 时注册并激活 `read_skill`。

### Step 5：装配接线

- [x] `agentRunner` 计算实际生效清单（capabilityService 保持配置读取，不依赖 mcpManager/skillLoader）：
  - `prepareBinding()` / `restoreSession()`：一律**全量**——MCP 取 `mcpManager.getTools()` 全量、skill 取全部可用（`disable-model-invocation` 除外），产出 `activeMcp`（全名）与 `activeSkills`（注入清单），无页面允许列表过滤。
  - `createRegistry` 注册 MCP 包装工具 + `read_skill`；按全量激活集 `setActive`（无页面/项目裁剪）。
  - `beginSessionTurn()`：快照 `mcp[]`/`skills[]` 记实际生效清单。
  - 恢复历史会话（`restoreSession`）：MCP/skill 按当前配置重载，快照仅展示/校验。
  - `send()` 入口 `_expandSkillCommand`：`/skill:<name> args` → 正文块（strip frontmatter）+ args；未命中原样透传。
  - `index.ts`：启动 `ensureConnected()`，`will-quit` 时 `disconnectAll()`。

## 3. 验收

- [ ] MCP：配置 `agent.mcp` 后启动，MCP 工具名形如 `server_tool`、可被模型调用；坏配置 server 不影响其他能力（日志 failed）。
- [ ] Skill：`~/.lx/skills/<name>/SKILL.md` 注入 `available_skills`；`read_skill` 进激活集；模型可读正文。
- [ ] 显式触发：`/skill:<name> args` 展开为正文块；`disable-model-invocation` 的 skill 仅显式可用。
- [x] 双来源冲突：user 生效、project 记诊断；注入上限 50 生效（单测覆盖）。
- [ ] 恢复历史会话：MCP/skill 按当前配置重载。
- [x] 无遗留旧导入 / 重复 channel；`pnpm typecheck` + 受影响文件 Biome。

## 4. 测试建议

- [x] `test/main/agent/mcp/jsonSchemaToZod.test.ts`：schema 转换（object/array/enum/anyOf/降级）。
- [x] `test/main/agent/skills/skillLoader.test.ts`：SKILL.md 根约定、frontmatter 校验、冲突优先级、上限。
- [x] `test/main/agent/skills/readSkillTool.test.ts`：命中/未命中/截断。
- [x] `test/main/agent/agentRunner.expandSkill.test.ts`：`/skill:` 展开与透传。

## 5. 文档同步

- [x] `mcp.md`、`skills.md` 新增。
- [x] `extensions.md` §4/§5 由"后续"改为"已实现"。
- [x] `design.md` 模块结构 + 架构图补 MCP/skill 层。

## 6. 联网搜索（web_search）

设计决策见 [websearch.md](./websearch.md)；本文件只列改动项与验收。

### 6.1 实现项

- [x] `src/main/agent/tools/webSearch.ts`：`createWebSearchTool`（zod schema，Exa 优先 / Tavily 兜底，无 Key 匿名直连，匿名被拒 provider 暂停重试，全失败抛英文提示）。
- [x] 装配：`agentRunner.createRegistry` 注册 + `ALL_TOOL_NAMES` 收录 `web_search`；`capabilityService` 的**全量默认能力集**默认激活（无页面裁剪）。
- [x] 渲染：`AgentWebSearchBlock`（emerald 独立配色、不参与普通工具折叠）；`AgentMessageItem` 归并连续 `web_search` 为独立分组（`[条件1], [条件2]` 展示）。
- [x] 配置：`ai.webSearch` 节点（`exaApiKey` / `tavilyApiKey`）于 `~/.lx/config.json`，`createWebSearchTool` 内 `readWebSearchConfig()` 读取。

### 6.2 验收

- [ ] 配置 `ai.webSearch` Key 后，模型可调 `web_search` 联网并回填回答。
- [ ] 无 Key 时仍匿名直连（优先 Exa）；两 provider 全失败展示英文 `Web search failed`。
- [ ] 连续多次搜索渲染为 `[条件1], [条件2]`，不进入普通工具折叠组。

### 6.3 测试

- [x] `test/main/agent/webSearchTool.test.ts`：参数校验、Exa 优先、失败回退、双失败英文提示、无 Key 匿名、匿名 401 暂停重试。
- [x] `test/renderer/features/agent/AgentMessageItem.test.tsx`：web_search 合并展示、不折叠、全失败提示。
- [x] 快照断言同步（`agentRunner.test.ts` / `capabilityService.test.ts` 页面/内置能力集）。
