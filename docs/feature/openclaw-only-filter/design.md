# OpenClaw 消息列表员工筛选（/only） 设计

在 OpenClaw 合流时间线上补一个**视图筛选**：`/only` 打开员工多选面板，选中后列表只显示这些员工的消息；面板「全部员工」行与顶部恢复按钮一键还原全量。本轮同时收窄面板候选、对齐 AgentInput 的模糊匹配规则、对齐输入区宽度，并让 AI 消息始终展示模型名。

> 工作区：`.worktrees/feat-openclaw-only-filter`（分支 `feat/openclaw-only-filter`，从 `dev` 切出）
> 文档：本文件与 `task.md` 保留在主工作区 `docs/feature/openclaw-only-filter/`，不随代码提交

## 1. 目标

- **命令入口**：`/only` 复用 `/clear` 的二级面板交互（文本派生、Space 多选切换），选中即**实时**收窄消息列表。
- **一键恢复**：`/only` 面板的「全部员工」行 + 页面顶部恢复按钮（非 only 状态禁用），以及顶部 only 员工 chips（`×` 逐项移除，移除最后一个即退出）。
- **候选收窄**：`/only` 与 `/clear` 面板只列**消息列表中真实出现过的员工**（含扇出目标），并各带一行「全部员工」批量开关。
- **模糊规则对齐**：`/` 命令与 `@` 提及完全对齐 AgentInput 的匹配规则，`@claw` 过滤抽成共享纯函数。
- **输入区宽度对齐**：输入框与消息列左右边缘一致（含消息列 `scrollbar-gutter` 预留槽）。
- **模型名始终展示**：AI 消息一律显示模型名，不再只有会话首条显示。
- **零副作用**：只影响消息列表与输入框展示，不改发送扇出目标、会话数据与主进程链路。

## 2. 非目标

- 不做跨办公区筛选与持久化：切办公区即清空，跳页返回保留（内存态）。
- 不改 `selectedAgentIds`（派发目标）、`@claw` 提及协议、发送链路与远端会话。
- 不做筛选预设、关键字/时间等其它筛选维度；面板不做搜索框与分页。
- 不裁剪扇出消息气泡里的目标员工名单。
- 不新增 IPC、主进程改动与数据库迁移；模型名回退只在渲染层推断，不回填主进程权威数据。

## 3. 决策记录（grill 结论）

| # | 决策 | 结论 |
| :- | :--- | :--- |
| 1 | `/only` 面板生效时机 | Space 切换**实时**应用筛选；Enter / Esc 只做收尾（清空输入 + 关闭面板），无草稿态 |
| 2 | 命令可见性 | `/only` 仅当**消息列表中出现过的员工数 > 1** 时出现（已在 only 状态也保留，用于调整）；不上线独立恢复命令 |
| 3 | 状态归属 | `openclawOfficeStore.onlyAgentIds: string[] \| null`；空数组归一化为 `null`；切办公区置 `null`；员工失效时页面 effect 裁剪 |
| 4 | 扇出消息过滤 | `targetAgentIds`（缺省回落 `[agentId]`）与 only 集合**有交集即保留**；展示不裁剪 |
| 5 | 空态与删除入口 | 过滤后为空显示专属文案；删除入口基于**过滤后**的时间线计算 |
| 6 | 顶部形态 | 左侧 `筛选：` + 员工 `LxTag`（`×` 移除）；恢复按钮常驻右侧动作区、非 only 禁用；新增筛选项统一走 `/only` |
| 7 | 与派发目标关系 | 完全解耦：only 不改 `selectedAgentIds`，选择器/发送扇出行为不变 |
| 8 | 面板候选来源 | 完整时间线的 `agentId ∪ targetAgentIds` 去重集合（非办公区名册）；`/clear` 面板同步收窄 |
| 9 | 「全部员工」行 | 两面板统一的批量开关（Space 切换）：`/only` 勾选态 = 无筛选，选中即显示全部；`/clear` 全选 ⇄ 清空参数，Enter 仍按既有语义执行。`/all` 命令撤销 |
| 10 | 输入区宽度对齐 | 输入区 `pl-4` + `pr-[calc(1rem+var(--lx-scrollbar-size))]`（`--lx-scrollbar-size: 6px` 与 `styles.css` 的滚动条宽度同源）+ `mx-auto w-full max-w-3xl`，并去掉 `OpenClawInput` 根节点水平 `p-0.5`：宽屏与窄窗下边框盒都与消息列完全等宽 |
| 11 | `/` 与 `@` 模糊规则 | 完全对齐 AgentInput：`/` = 名称/别名（`clear→new`）∪ tag「Builtin」，**本地化描述不参与**；`@` = 共享纯函数 `filterClawMentionCandidates`（tag 模糊命中整类返回、`claw:`/`claw/` 前缀裁剪、name/agentId/instanceId/instanceName/`instanceId/agentId` 五路过滤） |
| 12 | AI 消息模型名始终展示 | 渲染层按 Agent 前向填充：**消息自带 `model` → 同一 Agent 时间线上最近一条带 `model` 的消息 → 会话当前模型 `snapshot.stats.model`**；`ConversationAgent` 增加 `model`，不回填主进程权威数据 |

## 4. 现状约束（已核查）

- 时间线合并：`mergeOfficeTimeline` 把发往多人的同内容用户消息合并为一条，`agentId` 记首来源、`targetAgentIds` 记全部（`hooks/useOpenClawOffice.ts`）。
- 命令体系：`OPENCLAW_COMMANDS` + `getMatchedOpenClawCommands`（`openclawCommands.ts`）；`keepsCommandText` 决定二级面板由输入文本派生。
- 输入框面板状态机：文本派生的 picker 优先于命令/提及面板；multiSelect 下 Space 切换、Enter 直发；Esc 关闭面板并回调 `onPickerClose`。
- `/clear` 页面裁决：面板 `onPick` 改写文本；`handleSend` 解析命令行并决定建会话（`pages/openclaw/index.tsx`）。
- 消息列表：`deletableAssistantIds` 由**传入** timeline 计算；空列表文案 `openclaw.conversationEmpty`；消息头 `OpenClawAssistantMessage` 只要拿到 `model` 就渲染（无「仅首条」逻辑）。
- 模型数据：`message.model` 只在历史水合与 run 结束时由网关 per-message 字段回填（`payloadMappers.ts`、`eventProjection.ts`），网关通常只给会话首条 AI 消息带该字段；会话级模型由 `sessions.describe` 投影为 `snapshot.stats.model`。
- 滚动条：`styles.css` 的 `::-webkit-scrollbar` 宽 6px，消息列 `[scrollbar-gutter:stable]` 预留同宽槽位。
- AgentInput 规则：`getMatchedCommands` 匹配名称/别名 ∪ tag、描述不参与；`useAgentInputPanels` 的 claw 分支 tag 模糊命中整类返回并匹配实例字段。
- 测试栈：vitest + @testing-library/react。

## 5. 数据结构

### 5.1 `openclawOfficeStore.ts`

```ts
interface OpenClawOfficeState {
  // 仅视图筛选：null = 不筛选；空数组归一化为 null（退出 only）。
  onlyAgentIds: string[] | null
  setOnlyAgentIds: (agentIds: string[] | null) => void
}
```

- `setOnlyAgentIds` 归一化：去重、剔除空串、空数组 → `null`；`selectOffice` 一并置 `null`。
- 不新增 toggle action：面板走文本派生，顶部 `×` 走 `setOnlyAgentIds(filter)`。

### 5.2 `openclawCommands.ts`

```ts
export type OpenClawCommandId = "clear" | "stop" | "office" | "only"

export const getMatchedOpenClawCommands = (
  value: string,
  t: (key: TranslationKey) => string,
  canOnly?: boolean, // 消息列表中出现过的员工数 > 1；缺省 true
): AgentInputCommand[]

export const splitCommandAgentNames = (args: string): string[]
export const toggleCommandAgentName = (current, commandId, name): string
export const toggleAllCommandAgentNames = (current, commandId, names): string
```

- 匹配通道：名称/别名（`clear → ["clear","new"]`）∪ tag `getCommandTagLabel({ kind: "builtin" })`，本地化描述不参与。
- 命令规格最终为 `clear / stop / office / only`；`/all` 已撤销。

### 5.3 面板候选集合（页面派生，不新增 state）

```ts
const timelineAgentIds = useMemo(() => {
  const ids = new Set<string>()
  for (const item of timeline) {
    ids.add(item.agentId)
    for (const agentId of item.targetAgentIds ?? []) ids.add(agentId)
  }
  return ids
}, [timeline])

const timelineAgents = useMemo(
  () => agents.filter((agent) => timelineAgentIds.has(agent.id)),
  [agents, timelineAgentIds],
)

const onlyCommandAvailable = timelineAgents.length > 1
```

两个面板都用 `timelineAgents` 作为员工行，并在首位插入保留 id `"__all__"` 的「全部员工」行。

### 5.4 `filterOfficeTimeline`（`useOpenClawOffice.ts`）

```ts
export const filterOfficeTimeline = (
  timeline: readonly OfficeTimelineMessage[],
  onlyAgentIds: readonly string[] | null,
): OfficeTimelineMessage[]
```

`null` / 空集合返回原引用；否则保留 `(targetAgentIds ?? [agentId])` 与集合有交集的条目。

### 5.5 模型名解析（`OpenClawMessageList` 派生）

```ts
// 消息自带优先 → 同一 Agent 最近一条已记录模型 → 会话当前模型。
const modelByMessageId = useMemo(() => {
  const lastKnownByAgent = new Map<string, string>()
  const resolved = new Map<string, string>()
  for (const item of timeline) {
    const { agentId, message } = item
    if (message.model) lastKnownByAgent.set(agentId, message.model)
    if (message.role !== "assistant") continue
    const model = message.model ?? lastKnownByAgent.get(agentId) ?? agentMap.get(agentId)?.model
    if (model) resolved.set(message.id, model)
  }
  return resolved
}, [agentMap, timeline])
```

`ConversationAgent` 增加 `model?`（页面从 `snapshot.stats.model` 注入）；`OpenClawMessageItemProps` 增加 `model?`（缺省回落 `message.model`）。

### 5.6 共享提及过滤（`agentMarkdownInputUtils.ts`）

```ts
export const filterClawMentionCandidates = (
  candidates: readonly ClawMentionCandidate[],
  query: string,
): readonly ClawMentionCandidate[]
```

tag 模糊命中 `claw` 时整类返回；`claw:` / `claw/` 前缀裁掉后按 name、agentId、instanceId、instanceName、`instanceId/agentId` 过滤。AgentInput 的 `useAgentInputPanels` 与 `OpenClawInput` 共用。

## 6. 交互与状态机

1. 输入 `/` → 命令面板出现 `/only`（`canOnly` 时），选中后写入文本 `/only` → 文本派生二级面板（`keepText: true`）。
2. 面板内 **Space**：`toggleCommandAgentName(input, "only", name)` 改写文本 → 从新文本解析员工名并解析为 id 集合 → `setOnlyAgentIds(ids)`，列表实时收窄。
3. **Enter** → `handleSend` → 解析 `/only`：空参数保持面板打开；名字全部不匹配（仅手动输入可能）toast `openclaw.sessionNoMatch` 并清空输入；否则应用集合、清空输入、关闭面板。
4. **Esc**：关闭面板 + 清空派生命令文本；已应用的筛选保留（不回滚）。对 `/clear` 等所有文本派生面板同样生效。
5. `/only` 面板「全部员工」行：Space → 文本回到裸 `/only` + `setOnlyAgentIds(null)`；勾选态由 `onlyAgentIds === null` 派生。
6. `/clear` 面板「全部员工」行：Space → `toggleAllCommandAgentNames(input, "clear", timelineAgents 名称)`，候选全在参数中时清空参数，否则一次性全选；Enter 仍走既有建会话语义。
7. 顶部 chips `×` 逐项移除，最后一个移除即退出 only；恢复按钮 `setOnlyAgentIds(null)`。
8. AI 消息模型名：列表逐条解析后传入消息项，消息项缺省回落 `message.model`，组件始终渲染（拿到值即显示）。
9. `/` 命令：`/bltin` 经 tag 召回全部内置命令；`/new` 经别名命中 `/clear`；中文描述关键词不再召回。
10. `@` 提及：`@cla` 整类返回；`@claw:local/lily` 精确过滤；`@amy` 按名称命中；`@xyz` 不出面板。

## 7. 实现拆分（文件级）

| 文件 | 改动 |
| :--- | :--- |
| `features/openclaw/openclawCommands.ts` | `only` 规格；`OpenClawCommandId` 扩展；`split/toggleCommandAgentName` 泛化；`toggleAllCommandAgentNames`；`getMatchedOpenClawCommands` 增加 `canOnly` 并改用「名称/别名 ∪ tag」匹配 |
| `features/openclaw/openclawOfficeStore.ts` | `onlyAgentIds` + `setOnlyAgentIds`（归一化）；`selectOffice` 重置 |
| `features/openclaw/hooks/useOpenClawOffice.ts` | 新增 `filterOfficeTimeline` |
| `features/agent/.../agentMarkdownInputUtils.ts` | 新增共享 `filterClawMentionCandidates`，`useAgentInputPanels` 改为调用 |
| `features/openclaw/components/OpenClawInput.tsx` | `onlyCommandAvailable` prop；可见性变化刷新命令面板；Esc 清空派生文本；`@` 提及改用共享过滤；去掉根节点水平 `p-0.5` |
| `features/openclaw/components/OpenClawMessageList/OpenClawMessageList.tsx` | `isFiltered` 空态；`modelByMessageId` 前向填充 |
| `.../OpenClawMessageItem/{types.ts,OpenClawMessageItem.tsx}` | `ConversationAgent.model?`；`model?` prop（回落 `message.model`） |
| `pages/openclaw/index.tsx` | `timelineAgents` / `onlyCommandAvailable`；两个 picker 用 `timelineAgents` + 「全部员工」行；`/only` 裁决；`visibleTimeline`；顶部 chips + 恢复按钮；失效裁剪；输入区宽度对齐；`conversationAgents` 附带会话模型 |
| `styles.css` | 新增 `--lx-scrollbar-size`，`::-webkit-scrollbar` 引用 |
| `features/openclaw/index.ts` | 导出新符号 |
| `i18n/locales/{zh,en}/openclaw.ts` | 新键（见第 8 节） |
| `docs/agent/openclaw.md` | 命令表补 `/only` 与面板候选规则 |

## 8. i18n 键（zh / en 一一对应）

| key | zh | en |
| :--- | :--- | :--- |
| `openclaw.commandOnlyDesc` | 只显示选中员工的消息 | Show only selected agents' messages |
| `openclaw.pickerAllAgents` | 全部员工 | All coworkers |
| `openclaw.onlyFilterLabel` | 筛选： | Only: |
| `openclaw.onlyPickerTitle` | 选择要显示的员工 | Select coworkers to show |
| `openclaw.onlyFilterClear` | 恢复全部消息 | Show all messages |
| `openclaw.onlyFilterRemove` | 从筛选中移除 | Remove from filter |
| `openclaw.conversationFilteredEmpty` | 当前筛选下没有消息，用顶部恢复按钮显示全部。 | No messages under the current filter. Use the restore button above to show all. |

## 9. 已知限制与风险

- **同名员工**：筛选文本按名字承载（与 `/clear` 一致），同名员工会被同时选中；不额外处理。
- **Esc 行为变更**：文本派生面板（`/clear`、`/only`）Esc 会连同派生文本一并丢弃。
- **吸底/滚动**：`filterOfficeTimeline` 在 `null` 时返回原引用，避免滚动 effect 被无用新数组触发。
- **面板候选收窄的副作用**：手工输入不在候选中的员工名仍可执行，只是面板不显示该行；筛选中的员工若消息被全部删除会退出候选，此时只能用顶部 chip `×` 或「全部员工」行移除。
- **命令描述不再参与匹配**：`/清空`、`/切换` 这类本地化关键词查询不再召回，可改用名称或 tag。
- **`@` 提及放宽前缀门控**：`@amy` 现在会命中提及面板；未命中任何字段与 tag 的查询仍不出面板。
- **模型名是渲染层推断**：会话模型切换后，早于「首个已记录模型」的消息可能显示会话当前模型（仅当整个会话无任何模型记录时触发）。

## 10. 测试

| 文件 | 断言点 |
| :--- | :--- |
| `test/renderer/features/openclaw/filterOfficeTimeline.test.ts`（新增） | `null` 返回原引用；交集保留（含扇出条目）；无交集剔除；空集合不参与过滤 |
| `test/renderer/features/openclaw/openclawCommands.test.ts`（扩展） | `canOnly=false` 不展示 `/only`；`/all` 已移除；`toggleCommandAgentName` 两态输出；`toggleAllCommandAgentNames` 全选/清空/去重；tag 召回整类、`/new` 别名、描述不参与 |
| `test/renderer/features/openclaw/openclawOfficeStore.test.ts`（扩展） | `setOnlyAgentIds([])` → `null`；去重；`selectOffice` 重置 |
| `test/renderer/features/agent/filterClawMentionCandidates.test.ts`（新增） | tag 命中整类；`claw:`/`claw/` 前缀裁剪；五路字段过滤；未知查询为空 |
| `test/renderer/features/openclaw/OpenClawInput.test.tsx`（扩展） | `onlyCommandAvailable` 控制命令列表；Esc 清空派生文本、显式面板保留文本；`@cla`/`@amy`/`@xyz` 面板 |
| `test/renderer/features/openclaw/OpenClawMessageList.test.tsx`（扩展） | `isFiltered` 空态；模型名前向填充、按 Agent 隔离、会话模型兜底、自带优先 |
| `test/renderer/pages/openclaw/OpenClawPage.onlyFilter.test.tsx`（新增） | 两面板「全部员工」行；Space 实时过滤；chips `×`；恢复按钮禁用态；候选阈值；切区重置；员工失效裁剪 |

## 11. 验收

1. 消息列表出现 ≥ 2 名员工时输入 `/only` → 面板只列这些员工 + 「全部员工」行；Space 切换，列表实时只显示对应员工（含扇出消息）的消息。
2. Enter / Esc 收起面板并清空输入；筛选仍在；「全部员工」行一键显示全部。
3. 顶部出现 `筛选：` + 员工 chips；`×` 逐项移除；移除最后一个即还原全量；非 only 状态恢复按钮禁用。
4. `/clear` 面板同样只列出现过的员工，且「全部员工」行可一键全选/清空参数。
5. 过滤后为空显示专属空态；删除入口只出现在可见列表的最后一条 AI 消息上。
6. 切办公区后筛选清空；员工被禁用后筛选自动裁剪。
7. `/bltin`、`/new`、`@cla`、`@amy` 按 AgentInput 规则命中；`/选择`、`@xyz` 不命中。
8. 输入框与消息列左右边缘对齐（含滚动条预留槽）。
9. 每条 AI 消息都显示模型名。
10. `pnpm exec vitest run test/renderer/features/openclaw test/renderer/pages/openclaw test/renderer/features/agent`、`pnpm typecheck`、`pnpm lint` 全绿；无硬编码中文；无新增原生 `title`；样式使用 CSS Token。

## 12. 交付状态

- 工作区：`.worktrees/feat-openclaw-only-filter`，分支 `feat/openclaw-only-filter`（自 `dev` 5c4efb87 切出）。
- 提交（5 个）：
  1. `b9688d48` `feat(openclaw): 消息列表 /only 员工筛选与 /all 恢复`
  2. `403a5a58` `feat(openclaw): /only 面板候选收窄并新增「全部员工」行`
  3. `60693fe6` `style(openclaw): 输入区与消息列同宽`
  4. `d6559f8e` `feat(openclaw): / 与 @ 模糊匹配对齐 AgentInput，输入区对齐滚动条预留槽`
  5. `482bc2c8` `feat(openclaw): AI 消息始终展示模型名（按 Agent 前向填充并回退会话模型）`
- **合并**：已以 `--no-ff` 合并回 `dev`，合并提交 `0a7fa7b8`（`Merge branch 'feat/openclaw-only-filter' into dev`，无冲突，含 `dev` 上已合入的 front-design 评审闭环）；工作区 `.worktrees/feat-openclaw-only-filter` 与分支 `feat/openclaw-only-filter` 已移除。
- 验证（合并后在 `dev` 上复跑）：`test/renderer/features/openclaw` + `test/renderer/pages/openclaw` + `test/renderer/features/agent` + `test/renderer/pages/front-design` 117 文件 / 887 用例全过；`pnpm typecheck`、`pnpm lint` 全绿；全量套件仅剩 dev 上既有的 6 个环境类失败（agentRunner / db / capabilityService / pixelNavLevels）。
- 已知测试噪音：上述四套件组合运行偶发 `ReferenceError: window is not defined`（未处理错误，来自 `AgentInput.secondaryFuzzy.test.tsx` 的异步续延在 jsdom 环境销毁后触发；单跑该文件与三套件组合均无此现象，`dev` 合并前 114 文件组合亦无；每次运行错误数 0/2/4 波动且全部用例通过），与本轮改动无关，待后续独立修复。
- 遗留：手工验收（`pnpm dev`）建议在 `dev` 上执行一次。
