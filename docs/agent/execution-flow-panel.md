# Agent 执行流程与全景 Trajectory 架构设计

本文档归档了 Agent 执行流程面板（Execution Flow / Trajectory Panel）与提示词注入全景追踪的架构设计、三进程 IPC 契约、数据流转换及后续演进规划。

---

## 1. 业务背景与定位

在复杂智能体交互与长上下文执行过程中，用户和开发者需要清晰、透明地观测 Agent 的全生命周期状态。
传统对话视图仅呈现最终问答气泡，而忽略了**系统提示词组装、环境上下文注入、思考过程、工具调用参数/结果、行级代码差异（Diff）、子代理分发及上下文压缩**等关键内部轨迹。

执行流程面板（`AgentExecutionFlowPanel`）以只读、时间轴快照形式，覆盖在消息列表上方，提供一站式全生命周期轨迹观测。

---

## 2. 核心架构与三进程通信

```
┌────────────────────────────────────────────────────────┐
│                      Renderer 渲染进程                  │
│  - AgentExecutionFlowPanel (快照捕获 / 过滤 / 差异对比)  │
│  - executionFlow.ts (纯函数数据投影: ChatBlock[] -> Step[])│
└───────────────────────────▲────────────────────────────┘
                            │ agentApi.getPromptAssembly(sessionId, cwd)
┌───────────────────────────┴────────────────────────────┐
│                      Preload 预加载层                   │
│  - exposeInMainWorld("agentApi", { getPromptAssembly }) │
└───────────────────────────▲────────────────────────────┘
                            │ ipcRenderer.invoke(AGENT_CHANNELS.getPromptAssembly)
┌───────────────────────────┴────────────────────────────┐
│                       Main 主进程                       │
│  - agentHandlers.ts (IPC 路由与会话校验)                 │
│  - agentRunner.ts (协调 DefaultSystemPromptManager)     │
│  - SystemPromptManager (分段装配: identity/persona/     │
│                         skills/instructions/context)   │
│  - ToolRegistry (收集 activeTools 工具全集)             │
└────────────────────────────────────────────────────────┘
```

### 2.1 IPC 通道契约
* **Channel**: `AGENT_CHANNELS.getPromptAssembly` (`"agent:getPromptAssembly"`)
* **Request Payload**: `{ sessionId?: string, cwd?: string }`
* **Response Payload (`PromptAssembly`)**:
  ```ts
  export interface AssembledSection {
    name: string
    text: string
    priority?: number
  }

  export interface AssembledContext {
    name: string
    text: string
  }

  export interface PromptAssembly {
    sections: AssembledSection[]       // 身份、人设、指令、已加载技能
    contexts: AssembledContext[]       // OS、CWD、分支、时间等运行时注入
    variables: Record<string, string>  // 模板替换变量表
    activeTools: string[]              // 当前会话激活的工具名称列表
    rendered: string                   // 最终合并的完整系统提示词字符串
  }
  ```

---

## 3. 全生命周期步骤投影模型 (`ExecutionStep`)

`executionFlow.ts` 中的 `buildExecutionSteps(messages, promptAssembly)` 将会话消息与系统装配投影为扁平、有序的步骤序列：

| 步骤类型 (`kind`) | 数据源 | 展示内容 |
| :--- | :--- | :--- |
| **`system`** (#0) | `PromptAssembly` | 分段抽屉折叠查看各 Prompt 片段、环境变量注入与激活工具全集 |
| **`user`** | `ChatMessage (role: "user")` | 用户原始输入、Slash 指令 (`/mode`、`/init`)、文件附件与即时插话 (`isSteer`) |
| **`thinking`** | `ChatBlock (kind: "thinking")` | 纯净思考内容预览与展开折叠 |
| **`tool`** | `ChatBlock (kind: "toolCall" + "toolResult")` | 工具名称、输入参数 JSON、行级代码差异 (`AgentDiff`)、LSP 诊断与错误标识 |
| **`subagent`** | `ChatBlock (kind: "toolCall", tool: "task")` | 子代理任务描述、Prompt 指令与 Token 独立用量统计 |
| **`compaction`** | `ChatMessage (role: "compactionSummary")` | 上下文压缩摘要、触发模式（手动/自动）及前后 Token 节省比例 |
| **`assistant`** | `ChatMessage (role: "assistant")` | 助手最终输出、模型名称、停止原因 (`stopReason`) 与 KV Cache 命中统计 |

---

## 4. UI/UX 设计与规范

1. **抽屉式覆盖与快照隔离**：
   * 点击顶部工具栏 `Workflow` 图标，面板从顶部平滑下滑展开；
   * 打开瞬间捕获当前会话的只读快照，避免流式输出过程中列表频繁跳动；支持手动点击刷新。
2. **滚动条槽位预占 (`scrollbar-gutter: stable`)**：
   * 滚动容器配置 `overflow-y-scroll [scrollbar-gutter:stable]`，确保步骤展开/收起时面板内容宽度绝对稳定，无抖动。
3. **极简折叠 Title**：
   * 消除重复的标签文本，折叠条目直接由清晰的基础类型标签（`用户` / `思考` / `工具` / `子代理` / `系统` / `回复`）跟随具体的内容摘要。
4. **严格语言国际化**：
   * 零硬编码中文，在中英文状态下均呈现纯正的多语言文案。

---

## 5. 后续演进与预留字段规划

为满足未来高阶 Agent 可观测性与调试需求，建议在后续版本中按需引入以下轻量级可选字段：

```ts
export interface ExecutionStepExtended {
  // 1. 性能与耗时监控
  durationMs?: number           // 该步骤执行总耗时（毫秒）
  ttftMs?: number               // 首字延迟 Time To First Token（LLM 步骤特有）

  // 2. 权限与安全审计
  permissionAudit?: {
    decision: "allow" | "deny" | "auto_allow"
    mode: "default" | "yolo" | "whitelist"
    reason?: string
  }

  // 3. 错误分类与重试链路
  errorKind?: "timeout" | "permission_denied" | "validation" | "context_overflow" | "runtime"

  // 4. MCP 扩展归属
  mcpServer?: string           // 如 "context7" / "codebase-memory-mcp"

  // 5. 环境指纹与缓存效率
  gitFingerprint?: {
    branch?: string
    commitHash?: string
    isClean?: boolean
  }
}
```
