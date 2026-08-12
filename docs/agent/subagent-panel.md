# Subagent 独立面板实现计划（参考 Claude Code）

本文定义 C 方案"完整 subagent 面板"的实施计划：将子代理从普通工具调用展示中**分离为独立组件**，不被执行组折叠，展示子代理内部运行记录。参考 Claude Code 的子代理展示概念（独立块 + 子代理名 + 可展开查看内部工具链与文本）。代码执行前需用户确认本文。

## 1. 背景与现状

现状（代码核验）：`task` 调用在 `AgentMessageItem` 的 `executionGroups` 中走**普通工具分支**——进 `AgentExecutionGroup`（可被折叠）、渲染 `AgentToolCallBlock`；`task.ts` 只桥接子代理**流式文本增量**（`message_update` → `tool_execution_update` → `ChatBlock.toolCall.progress` string），子代理内部工具步骤事件到达 task 工具后被丢弃。

目标：task 独立成组、新组件 `AgentSubagentBlock`（参考 Claude Code 展开子代理面板）、内部工具步骤 + 文本 + usage 结构化展示、新增专属配色/icon（不与现有 tool/skill/mcp/webSearch 重合）。

## 2. 决策记录（已确认）

| # | 决策 | 结论 |
|---|------|------|
| 1 | 面板内容 | 内部**工具步骤**（工具名 + 参数摘要 + 结果/错误）+ **流式文本** + **usage**；**不展示内部 thinking** |
| 2 | 进度回传 | **完整快照**：`task.ts` 维护子代理运行快照 `{ text, steps, usage }`，每次子代理事件推一次 `onUpdate({ content, details: { steps, usage } })`，renderer **覆盖**（不做增量合并） |
| 3 | 分组 | 每个 task **独立成组**（对齐 write 切断逻辑），不合并连续调用，**永不参与 `AgentExecutionGroup` 折叠** |
| 4 | 交互 | 标题 = `args.description`（回退 "Subagent"）；**运行中默认展开**（实时可见步骤/文本）；**完成后自动折叠**为单行（description + 步骤数 + 状态）；展开显示完整内部记录 |
| 5 | toolResult | 面板展示子代理**完整文本**；父消息流**不重复渲染** task toolResult（**模型侧仍收**，不影响决策） |
| 6 | 组件/数据 | **新建 `AgentSubagentBlock.tsx`** 从 `AgentToolCallBlock` 分离；`ChatBlock.toolCall` 新增 `subagent?: SubagentPanelData` 结构化字段（**替代** `progress` string） |
| 7 | 步骤粒度 | 工具名 + 参数摘要（96 字符，复用 `formatToolArgs` 风格）+ 结果单行摘要（成功文本 / 失败红色）；无多级展开 |
| 8 | 配色/icon | icon = `Workflow`（lucide），label 色 = **`indigo-300`**；`DOT_COLOR` 加 `subagent: bg-indigo-300` |

## 3. 数据模型

```ts
// ChatBlock.toolCall 新增（renderer types.ts）。
type SubagentStepStatus = "running" | "done" | "error"
interface SubagentStep {
  toolName: string
  args: Record<string, unknown>
  result?: string      // 结果摘要（成功）或错误信息
  status: SubagentStepStatus
}
interface SubagentPanelData {
  steps: SubagentStep[]
  text: string         // 当前/最终流式文本
  usage: { input: number; output: number; totalTokens: number }
  messageCount?: number
}
```

## 4. 实现要点

| 位置 | 改动 |
|------|------|
| `src/main/agent/tools/task.ts` | `subscribe` 扩展：`message_update`（文本）+ `tool_execution_start`（push running 步骤）+ `tool_execution_end`（更新 status/result）+ `agent_end`（聚合 usage）；维护完整快照；每次变更 `onUpdate({ content, details: { steps, usage } })` |
| `src/renderer/src/features/agent/types.ts` | 新增 `SubagentStep` / `SubagentPanelData`；`ChatBlock.toolCall` 加 `subagent?`，**移除 `progress`**（被取代） |
| `src/renderer/src/features/agent/components/AgentSubagentBlock.tsx`（新） | 标题行（Workflow indigo-300 + description/Subagent）；展开内容（步骤列表 + 文本 + usage）；运行中默认展开、完成自动折叠（grid-template-rows 动画） |
| `src/renderer/src/features/agent/components/AgentMessageItem.tsx` | `isTaskToolCall` 独立成组 `{ kind: "subagent" }`（切断 `currentExecution`，同 write）；`DisplayGroup` 加 subagent 类型；渲染 `AgentSubagentBlock` |
| `src/renderer/src/features/agent/hooks/useAgentChat.ts` + `utils.ts` | `tool_execution_update` 提取 `subagent` 快照覆盖 `ChatBlock.toolCall.subagent`（新增 `extractSubagentPanelData`） |
| `src/renderer/src/features/agent/components/AgentToolCallBlock.tsx` | **清理** task 相关（`Bot` icon、`formatToolCommand` task 分支、progress 展示）——task 不再走此组件 |
| `src/renderer/src/features/agent/components/AgentExecutionGroup.tsx` | `DOT_COLOR` 加 `subagent: "bg-indigo-300"` |

## 5. 明确不做项

- **子代理内部 thinking 展示**（淹没父消息流，且已有折叠思考块）
- **内部步骤落库**（v1 内存态，恢复后面板不可见；`agent_call.parent_call_id` 已留口，v2 补 provenance）
- **多级结果展开**（保持面板轻量）
- **tool-output 超限文件预览**（仅保留路径标记）

## 6. 实施规范与验证

- **工作区**：确认后在 `.worktrees` 新建 worktree（命名 `时间戳-subagent-panel`），在 worktree 内执行全部代码改动；完成 + 自测后询问是否合并回 `dev`。
- **精确校验**：`pnpm typecheck` + Biome format 受影响文件；跑现有 vitest（main/shared/preload 应仍 209 通过，无回归）；task.ts 桥接改动补 main 侧单测（步骤捕获/快照回传）。
- 完成检查：无遗留旧导入（`progress` 字段、`AgentToolCallBlock` 的 task 分支、`Bot` icon）、无重复 DTO。

## 7. 实现更新（2026-08-12，dev 已合入 `subagent-block` 分支后）

实际落地与上述计划存在以下差异（代码优先于本文）：

- **面板形态**：改为 **`AgentSubagentPanel` 顶部展开面板**（`AgentPage` 持有 `activeSubagent` 状态，点击 `AgentSubagentBlock` 顶部 label 触发；从头部下方 `translateY(-100% → 0)` 向下展开，恰好覆盖消息列表区域，消息列表保持挂载不卸载，输入框不受遮挡）。面板主体复用 `AgentMessageItem`（`readOnly` 只读模式）渲染子代理完整内部消息时间轴（工具/MCP/skill/文本/思考均可见）。`LxModal` 恢复原状（无 `width` 属性改动）。
- **面板头部统计**：底部 token 用量 footer 移除，改为头部关闭按钮左侧的统计 icon（`BarChart3`），hover `LxTooltip` 显示 3 行（输入/输出/总计 tokens，一行一个类型）；无快照时不展示统计 icon。面板不再展示任务描述行。
- **AI 消息聚合**：面板内部消息与 `AgentMessageList` 用同一套分组（`groupAgentMessages` + `buildQaGroups`，已抽离至 `features/agent/messageGrouping.ts` 复用）——一次子代理运行的助手消息 + 工具结果 + 续写合并进**一个** `AgentMessageItem`（`continuationMessages`），不再每条消息一个组件。
- **滚动按钮接管**：`AgentMessageList` 的滚动到底部按钮新增 `isSubagentPanelOpen` + `subagentScrollRef`（面板消息列表滚动容器）两 prop；面板打开时按钮目标切换为面板消息列表，可见性也改由面板列表滚动位置驱动，关闭后恢复主列表驱动。
- **用户消息吸顶**：主消息列表吸顶逻辑抽离为 `useMessagePin` hook（`features/agent/hooks/useMessagePin.ts`），`AgentMessageList` 与 `AgentSubagentPanel` 复用——用户消息完全滚出各自视口顶部后 sticky 钉在顶部，面板内同样生效。
- **快照内容扩展**：`SubagentData` 含 `name` / `description` / `prompt` / `messages`（完整内部上下文）/ `steps` / `usage` / `filePath`。`task` 工具输入新增可选 `name`（AI 分发），顶部 label 展示 `Subagent - {name}(task)`。
- **持久化已实现**：快照经 `details.subagent` 随 **`ToolResultMessage.subagent`** 落库（复用 `agent_session_entry` 真相源，无需新表）；恢复会话时 renderer 侧 `mergeSubagentSnapshots` 把快照回填到对应 `toolCall` 块，弹窗内容恢复可见。§5「内部步骤落库 v1 内存态」已不再成立。
- **步骤时间轴**：`AgentSubagentBlock` 第二个直角 icon 行按 `AgentExecutionGroup` 逻辑静态展示 Tool/Thought/MCP/Web Search 计数（不展开）；第三个直角 icon 行展示子代理当前状态（`Idle`/`Working`/`Done`/`Error` 英文文本，按 `toolCall.status` + 快照有无推导）。点击顶部 label 直接打开面板弹窗。
