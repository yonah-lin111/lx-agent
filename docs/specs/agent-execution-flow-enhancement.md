# Agent 执行流程面板（AgentExecutionFlowList）增强技术方案

## 1. 背景与目标

当前 `AgentExecutionFlowList` 提供了会话执行步骤的时间轴视图，但存在以下局限：
1. **执行指标不全**：工具调用缺少单步执行耗时（duration/wallTime）；模型生成缺少直观的模型、缓存命中（cacheRead）及单步 Token 明细展示。
2. **工具展示粒度粗糙**：所有工具统一采用通用 JSON 参数和简单文本结果展示，对于高频关键工具（如 `bash` 命令、文件操作 `read`/`edit`/`write`、代码检索 `grep`/`glob`/`lsp`、子代理 `task`）缺乏专门的高信息密度视图。
3. **折叠摘要信息弱**：未展开状态下难以快速定位命令详情、涉及文件路径及执行状态。

结合参考项目（`oh-my-pi-main/packages/collab-web` 中的工具分发渲染器机制与 `deepseek-harness-master` 的会话 Telemetry/Ledger 结构），本方案旨在为 `AgentExecutionFlowList` 的每条 Item 补充高价值数据并实现专用化视图增强。

---

## 2. 参考项目分析与高价值数据提炼

### 2.1 参考项目架构与特性
- **`oh-my-pi-main` (`collab-web/src/tool-render`)**：
  - 核心设计：工具渲染器采用模块化解耦架构（`ToolRenderer: { Summary, Body }`），按 `toolName` 注册分发。
  - 高价值呈现：
    - `bash`：前置环境变量 `envPrefix`、命令 `$ cmd`、状态徽标（`cwd`、`timeout`、`pty`、`async`、`exitCode`）、耗时 `wallTime`、输出尾部截断。
    - `task`：子任务列表、各子代理执行状态（`done` / `merge failed` / `failed` / `aborted`）、Token 与耗时统计、输出与警告提取。
    - 文件/搜索工具：明确的文件名徽标、行号范围、diff 行数变动统计、匹配项计数。
- **`deepseek-harness-master` (`session-telemetry` / `session-persistence`)**：
  - 核心设计：统一的结构化事件账本（Ledger），包含 `turn`、`step`、`time`、`severity`、`duration` 等维度，保证实时流与历史重放数据对齐。

### 2.2 提炼的高价值增强数据项（按 Item 维度）

| 步骤类型 | 新增/增强数据字段 | 展示位置 | 价值说明 |
| :--- | :--- | :--- | :--- |
| **通用（所有步骤）** | `durationMs`（单步耗时） | Item 头部右侧 / 详情底部 | 迅速识别耗时瓶颈（如网络慢、命令卡顿） |
| **通用（所有步骤）** | `timestamp`（时间戳微格式化） | Item 头部序号旁 | 明确步骤发生的绝对或相对时间 |
| **Tool: bash** | `command`、`cwd`、`exitCode`、`timedOut`、`jobId` | 头部标题 + 专用终端块 | 折叠即可看命令行；展开提供类似终端的命令与状态高亮 |
| **Tool: fileOps (read/write/edit)** | `filePath`、`offset/limit`、`linesCount`、`diffStats` (+added/-removed) | 头部标签 + 专用代码/Diff视图 | 快速识别改动的文件、范围及变更量 |
| **Tool: search (grep/glob/lsp)** | `query/pattern`、`path`、`matchCount`、`targetLocations` | 头部标签 + 结构化检索条目 | 清晰展示检索条件及匹配命中的代码位置 |
| **Tool: task (子代理)** | 描述、分配任务、嵌套步骤数、聚合 Token、耗时、状态 | 头部标签 + 专用子任务进度卡片 | 掌握复杂分解任务的执行进度与子结果 |
| **Assistant (大模型)** | `model`、`provider`、`stopReason`、`tokens` (input/output/cacheRead) | 头部右侧 + 底部指标行 | 清晰展示大模型版本、是否命中 Prompt 缓存及停止原因 |

---

## 3. 数据结构扩展设计

### 3.1 跨进程契约 (`src/shared/contracts/agent.ts`)
1. 在 `ToolResultMessage` 中增加可选的耗时统计：
```typescript
export interface ToolResultMessage {
  role: "toolResult"
  toolCallId: string
  toolName: string
  content: (TextContent | ImageContent)[]
  isError: boolean
  timestamp: number
  durationMs?: number // 增加：工具执行耗时（毫秒）
  diff?: AgentDiff
  subagent?: SubagentData
  lsp?: LspToolDetails
}
```
2. 在 `AgentEvent` 的 `tool_execution_end` 事件负载中增加 `durationMs`。

### 3.2 Main 进程工具执行埋点 (`src/main/agent/core/agent.ts` 或工具层)
- 工具执行时记录 `const start = Date.now()`，在工具返回时计算 `durationMs = Date.now() - start`，并随结果透传到 `tool_execution_end` 事件与 `ToolResultMessage`。

### 3.3 Renderer 进程类型模型 (`src/renderer/src/features/agent/types.ts`)
扩展 `ExecutionStep` 与 `ExecutionToolContent`：
```typescript
export interface ExecutionStep {
  // ... 原有字段保持不变
  durationMs?: number // 该步骤执行耗时
}

export interface ExecutionToolContent {
  toolName: string
  toolCallId?: string
  args: Record<string, unknown>
  result?: string
  isError?: boolean
  durationMs?: number
  diff?: AgentDiff
  lsp?: LspToolDetails
  // 结构化细节提取（由 executionFlow 解析）
  exitCode?: number
  timedOut?: boolean
  filePath?: string
}
```

---

## 4. UI 与组件架构改造

### 4.1 组件拆分与结构规划 (`src/renderer/src/features/agent/components/AgentExecutionFlowList/`)

```text
AgentExecutionFlowList/
├── AgentExecutionFlowList.tsx       // 列表主容器（智能吸底、过滤、统计汇总）
├── AgentExecutionFlowHeader.tsx     // 头部筛选与聚合统计栏
├── AgentExecutionFlowItem.tsx       // 单条 Item 容器（折叠控制、状态指示、耗时与复制）
├── FlowItemToolTitle.tsx            // 工具折叠标题栏（高信息密度提炼）
├── FlowItemToolContent.tsx          // 工具详情路由器（根据 toolName 分发）
│   ├── tools/
│   │   ├── FlowToolBash.tsx         // bash 终端命令与运行状态
│   │   ├── FlowToolFileOps.tsx      // read/write/edit 文件操作与 Diff 视图
│   │   ├── FlowToolSearch.tsx       // grep/glob/lsp 检索操作与命中概览
│   │   └── FlowToolGeneric.tsx      // 其它工具通用格式化保底
├── FlowItemAssistantContent.tsx     // 助手回复（集成 Model、Token 徽标）
├── FlowItemUserContent.tsx          // 用户输入与命令
├── FlowItemSubagentContent.tsx      // 子代理执行链路卡片
├── FlowItemThinkingContent.tsx      // 思考过程
├── FlowItemCompactionContent.tsx    // 上下文压缩详情
├── FlowItemSystemContent.tsx        // 系统提示词与注入详情
└── types.ts                         // 样式元数据与辅助计算工具函数
```

### 4.2 视觉与交互规范
- **符合设计规范**：继续使用项目专属 `LxTag`、`LxIconButton`，绝对禁止使用原生 `title` 属性（统一使用 `LxTooltip` 或 `LxIconButton.title` 配置）。
- **折叠状态信息密度**：
  - `bash`：显示命令行预览 `$ git status`，右侧展示耗时（如 `120ms`）与退出码。
  - `read/write/edit`：显示文件名标签与操作范围（如 `types.ts (+12/-3)`）。
  - `assistant`：显示模型名称（如 `gemini-2.5-pro`）及耗时/Token。
- **展开状态专业性**：
  - `bash`：深色终端模拟窗格，参数、环境、工作目录徽标化，标准输出带语法高亮。
  - `fileOps`：代码片段展示与行级 Diff，支持一键打开文件。

---

## 5. 实施计划与步骤

1. **Step 1（数据契约与数据流）**：
   - 修改 `src/shared/contracts/agent.ts`，扩展 `ToolResultMessage` 与 `AgentEvent` 中的耗时字段。
   - 在 `src/main/agent/` 工具执行流中计算并注入 `durationMs`。
   - 在 `src/renderer/src/features/agent/executionFlow.ts` 中解析并组装扩展字段到 `ExecutionStep`。
2. **Step 2（组件结构重构与专用渲染器）**：
   - 拆分 `FlowItemToolContent` 为模块化渲染器（`FlowToolBash`、`FlowToolFileOps`、`FlowToolSearch` 等）。
   - 增强 `FlowItemToolTitle`，在折叠标题栏提取展示关键业务参数。
   - 在 `AgentExecutionFlowItem` 头部右侧增加耗时、Token 徽标与模型标签。
3. **Step 3（测试与精准验证）**：
   - 编写/更新 `AgentExecutionFlowList.test.tsx` 单元测试，覆盖各工具专用视图与指标计算。
   - 执行 TypeScript 类型检查与 ESLint 校验。
