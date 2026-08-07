# TASKS：全局会话 + 历史面板项目 tag + 能力全量

本文档是"会话全局化（不随导航切换）、历史面板项目 tag 筛选、mcp/skill/tool 不做页面限制"的实现任务清单。设计决策见 [design.md](./design.md)（§1.3.3 / §1.4 / §9）、[database.md](./database.md)（§2.1 / §3 / §4）。本文件只列改动项、顺序与验收，供实现对照。

## 0. 范围

- **做**：会话归属冻结（全局会话）、`agent.pages` 能力裁剪移除、历史面板项目 tag 筛选、`listSessions` 全量化、相关测试与文档。
- **不做**：`ai.suggestedQuestions` 等模型配置删除（仅删 `agent.pages` 相关）；DB 迁移（表结构/CHECK 约束不变）；MCP remote/OAuth。

## 1. 已确认决策

| # | 决策 |
|---|------|
| 1 | **会话归属冻结**：归属（项目 + cwd）建会话时定死；切到项目 B 继续聊 A 的会话 → 工具仍在 A 路径执行；只有 B 新建对话或从历史选 B 会话才用 B 路径 |
| 2 | **能力全量**：所有会话一律内置九工具 + 全部已连接 MCP + 全部可用 skill；删除 `agent.pages` 读取与页面允许列表过滤 |
| 3 | **历史面板**：一次拉全量会话、客户端过滤；`AgentSessionSummary` 补 `projectId`；tag `All / Project / Current Project` 英文单选；选 `Project` 出现 `LxSelect` 选具体项目 |
| 4 | **config 清理**：只删 `agent.pages` 相关（用户 config 本无此项，文件无需改动）；模型配置保留 |
| 5 | **启动恢复**：挂载时恢复全局最近活跃会话；导航不触发任何会话切换 |

## 2. 实现顺序

### Step 1：契约层（无 filter 的会话列表 + projectId 摘要）

- [x] `src/shared/contracts/agent.ts`：
  - `AgentSessionSummary` 增加 `projectId: string | null`。
  - **删除** `AgentSessionFilter` 接口（无消费方）。
  - `AgentApi.agent.listSessions` 签名去掉 `filter` 参数。
- [x] `src/preload/api/agent.ts`、`src/renderer/src/features/agent/api/agentApi.ts`：`listSessions` 同步去掉 `filter` 参数与 `AgentSessionFilter` 引用。
- [x] `src/main/ipc/agentHandlers.ts`：删除 `isValidSessionFilter`；`listSessions` handler 不再接收/校验 filter。

### Step 2：main 侧（全量会话列表 + 全量能力）

- [x] `src/main/services/agentSessionService.ts`：
  - `toSummary` 映射 `projectId: row.project_id ?? null`。
  - `listSessions` 去掉 filter 参数，改为 `SELECT * FROM agent_session ORDER BY updated_at DESC, id DESC`（全量）。
- [x] `src/main/services/capabilityService.ts`：
  - 删除 `readAgentPages` / `getPageCapabilities` / `RawPageCapabilities` / `DEFAULT_PAGE_TOOLS`。
  - `DEFAULT_ITEM_TOOLS` 更名 `DEFAULT_TOOLS`（全量内置工具集，含 `web_search`）。
  - 收敛为单一导出 `getDefaultCapabilities(): AgentCapabilitySnapshot`（`tools` 全量，`mcp/skills` 空——实际装配由 runner 从管理器全量取）。

### Step 3：main 侧（agentRunner 会话生命周期）

- [x] `src/main/agent/agentRunner.ts`：
  - **删除** `bindingFromContext` / `isSameBinding` / `prepareBinding` / `bindingChanged` / `targetBinding`（"绑定变化即新会话"逻辑整体移除）。
  - **新会话判定改为 `isNewSession = !this.currentSessionId`**：仅新会话时从 `context` 冻结 `sessionBinding`、`requestedCwd`（`context.cwd ?? (binding.projectItemId ? resolveCwd() : homedir())`）与能力（全量）；非新会话忽略 context 的 binding/cwd。
  - `resolveMcpTools(snapshot)` 去掉 `binding` 参数 → 一律返回 `mcpManager.getTools()` 全量。
  - `resolveInjectedSkills(snapshot, cwd)` 去掉 `binding` 参数 → 全部可用（`disable-model-invocation` 除外），排序截断至 50。
  - `beginSessionTurn()` 不再因 bindingChanged 清空 `currentSessionId`；`sessionInput.binding = this.sessionBinding ?? {}`。
  - `restoreSession()` 能力重载改用全量（无允许列表）。
  - 标题生成触发条件 `isNewSession` 沿用（基于 `!this.currentSessionId`）。
  - `send()` 内 `prepareBinding(context)` 调用位点替换为新会话冻结逻辑（须在 `ensureReady()` 前完成，保证 cwd/能力就绪）。

### Step 4：renderer 侧（会话列表全量 + 导航不切会话）

- [x] `src/renderer/src/features/agent/hooks/sessionListStore.ts`：**删除** `toSessionFilter`；`refresh()` 无参（全量拉取）。
- [x] `src/renderer/src/features/agent/hooks/useAgentChat.ts`：删除 `toSessionFilter` import；`send` / `removeTurn` 成功后 `sessionListStore.refresh()` 无参。
- [x] `src/renderer/src/components/layout/RightSidebar.tsx`：
  - **删除** `useEffect [context]`（切上下文置空会话 + 恢复该桶最近会话）。
  - 新增**挂载一次性** effect：`sessionListStore.refresh()` + `agentApi.listSessions()` 取全局最新一条 `restoreChatRef.current?.(id)`；无会话则 `newChatRef.current?.()`。
  - 历史 tooltip 打开时 `sessionListStore.refresh()`（无 filter）。
  - `ChatHistoryPanel` 传 `currentProjectId={currentProject?.id}` 与项目列表（`projectApi.listProjects()` 或沿用 `projectNavigationApi`）。

### Step 5：renderer 侧（历史面板项目 tag）

- [x] `src/renderer/src/features/agent/components/ChatHistoryPanel.tsx`：
  - 新增 props：`currentProjectId?: string`、`projects: { id: string; name: string }[]`。
  - 搜索框下方 tag 组（`LxTag`）：`All / Project / Current Project`，英文、单选、高亮当前选中。
  - 选中 `Project` → 显示 `LxSelect`（项目列表，`size="small"`）。
  - 客户端过滤：`All` = 全部；`Project` = `session.projectId === 所选项目`；`Current Project` = `session.projectId === currentProjectId`（无当前项目时该 tag 过滤结果为空）。
  - 空态文案沿用「未找到匹配的会话」。
  - 宽高适配 tooltip（`w-60` → 按需放宽，tag 行换行不溢出）。

## 3. 验收

- [ ] 切换项目 item / 切换页面，**当前会话不变**（消息、标题、流式状态均保留）。
- [ ] 应用启动/进入时自动恢复**全局最近活跃**会话；无会话则空白新对话。
- [ ] 历史 tooltip 打开显示**所有会话**（不限页面/项目）；搜索 + tag 组合过滤生效。
- [ ] 选中 `Project` tag 出现项目 `LxSelect`，选择后只显示该项目会话；`Current Project` 只显示当前打开项目的会话。
- [ ] 从历史选择任意会话可恢复，工具在该会话冻结路径执行；在 B 新建对话后，工具在 B 路径执行。
- [ ] 所有会话均可调用全部内置工具、已连接 MCP 工具、可用 skill（`web_search` 等）。
- [x] `config.json` 无 `agent.pages` 相关项；代码无 `agent.pages` / `toSessionFilter` / `AgentSessionFilter` 残留引用。
- [x] 无遗留旧导入 / 重复 DTO / 重复 channel；`pnpm typecheck` + 受影响文件 Biome。

## 4. 测试建议

- [x] `test/main/services/capabilityService.test.ts`：**重写**为单一全量默认能力集（无 pages 解析）。
- [x] `test/main/agent/agentRunner.test.ts`：能力快照断言更新（全量默认，不再分页面）；`suggestedQuestions` fixture 保留（模型配置不删）。
- [x] `test/main/agent/agentRunner.expandSkill.test.ts` / `titleGenerator.test.ts`：fixture 不变（仅确认不受影响）。
- [x] 新增/更新会话列表测试：`listSessions` 全量排序、`AgentSessionSummary.projectId` 映射。

## 5. 文档同步

- [x] `design.md`：§1.3.3 能力限制移除、§1.4 全局会话、§9 历史面板 tag。
- [x] `database.md`：§2.1 归属冻结、§3 能力全量默认（移除 `agent.pages`）、§4 全量列表/最近活跃恢复、§6 接线。
- [x] `mcp.md` / `skills.md` / `extensions.md` / `websearch.md`：移除页面允许列表表述。
- [x] `TASKS.md`：Step 5 装配行与 §6.1 装配行更新为全量激活。

## 6. 风险与未决

| 项 | 说明 |
|----|------|
| 启动竞态 | 挂载时 `listSessions` + 恢复为异步：IPC 失败或竞态时保持空展示，不闪断当前会话 |
| 历史量级 | 全量拉取在会话数巨大时一次性进内存；当前桌面场景可接受，后续可按需服务端分页 |
| 会话归属漂移风险 | 归属冻结后，若用户把某个 item 会话从历史选中恢复时已不在该项目，工具 cwd 仍用该会话冻结路径（既定语义，见 database.md §8 cwd 冗余） |
