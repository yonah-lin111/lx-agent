import type { AgentMessage, AgentMessageRole, AgentPromptCard, ChatSession } from "./types"

// 默认预设提示词列表。
export const DEFAULT_PROMPT_CARDS: AgentPromptCard[] = [
  {
    id: "analyze-code",
    title: "代码深度重构",
    description: "分析结构，提供优化与重构方案",
    prompt: "请帮我分析和重构当前模块的代码，并提高其可维护性与可测试性。",
  },
  {
    id: "write-tests",
    title: "单元测试生成",
    description: "为核心逻辑补充高质量单测",
    prompt: "请为当前的单元功能生成完整的测试用例，覆盖边界条件与异常处理。",
  },
  {
    id: "explain-architecture",
    title: "架构设计分析",
    description: "梳理模块交互与数据流方向",
    prompt: "请解释当前系统的三进程架构设计与 renderer 层 feature 划分。",
  },
]

// Mock AI 回复模版。
export const MOCK_RESPONSES: string[] = [
  `### 🚀 收到您的指令！

针对您的需求，我已梳理出以下**优化重构方案**：

#### 1. 架构流向拆分
- **组件抽象**：将视图 UI 与状态逻辑彻底解耦。
- **状态流转**：使用标准的单向数据流。

\`\`\`typescript
interface RefactorResult {
  status: "success" | "pending";
  changes: string[];
}

const applyRefactor = (moduleName: string): RefactorResult => {
  return {
    status: "success",
    changes: [\`Optimized \${moduleName}\`, "Extracted hooks", "Added unit tests"]
  }
}
\`\`\`

#### 2. 注意事项
> 务必保证 \`components/ui\` 不依赖业务 feature，保持基础组件纯粹。

需要我进一步生成完整的单元测试代码吗？`,

  `### 💡 架构设计与依赖规则

LX Agent 的三进程分层架构遵循严格的单向依赖机制：

1. **Main 进程**：负责数据库 (\`connection.ts\`) 与持久化逻辑。
2. **Preload 进程**：通过 \`contextBridge\` 暴露安全白名单 API。
3. **Renderer 进程**：响应式 React 界面，基于 Feature-first 模式组织代码。

#### 示例引用
您可以查看文件 @src/renderer/src/components/ui/LxMarkdown/LxMarkdownPreview.tsx 了解 Markdown 的实时渲染机制。

如果有具体场景需要调整，随时告诉我！`,
]

// 分钟换算毫秒。
const MINUTE = 60_000

// 相对当前时间的 mock 时间戳（保证历史列表显示为可读时间）。
const now = Date.now()

// 构造 mock 消息。
const mockMessage = (
  role: AgentMessageRole,
  content: string,
  minutesAgo: number,
): AgentMessage => ({
  id: `mock-${role}-${minutesAgo}`,
  role,
  content,
  createdAt: now - minutesAgo * MINUTE,
})

// Mock 历史会话列表（首次打开历史面板时展示）。
export const MOCK_CHAT_SESSIONS: ChatSession[] = [
  {
    id: "mock-chat-architecture",
    title: "三进程架构设计解析",
    createdAt: now - 32 * MINUTE,
    messages: [
      mockMessage("user", "请解释当前系统的三进程架构设计与 renderer 层 feature 划分。", 32),
      mockMessage(
        "assistant",
        `### 三进程架构

LX Agent 采用严格的单向依赖分层：

1. **Main 进程**：负责数据库 (\`connection.ts\`) 与持久化逻辑。
2. **Preload 进程**：通过 \`contextBridge\` 暴露安全白名单 API。
3. **Renderer 进程**：响应式 React 界面，基于 Feature-first 模式组织代码。

渲染层按业务领域拆分为 \`features/*\`，如 \`agent\`、\`settings\`、\`project-navigation\`，彼此不互相依赖。`,
        31,
      ),
      mockMessage("user", "那 feature 之间如何共享基础组件？", 28),
      mockMessage(
        "assistant",
        "共享能力下沉到 \`components/ui\` 基础组件层（如 LxButton、LxTooltip），业务 feature 只能向上依赖 UI 层，禁止 feature 间交叉引用。",
        27,
      ),
    ],
  },
  {
    id: "mock-chat-refactor",
    title: "代码深度重构方案",
    createdAt: now - 2 * 60 * MINUTE,
    messages: [
      mockMessage("user", "请帮我分析和重构当前模块的代码，并提高其可维护性与可测试性。", 120),
      mockMessage(
        "assistant",
        `### 重构方案

1. **状态解耦**：将视图 UI 与状态逻辑彻底拆分，逻辑下沉为 hooks。
2. **单一职责**：按职责拆分过长的组件与方法。
3. **依赖注入**：将外部依赖（IPC、存储）注入而非直接引用。

\`\`\`typescript
const useChat = (deps: ChatDeps) => {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  // ...
}
\`\`\`

重构后可维护性与可测试性显著提升。`,
        119,
      ),
    ],
  },
  {
    id: "mock-chat-tests",
    title: "单元测试生成",
    createdAt: now - 24 * 60 * MINUTE,
    messages: [
      mockMessage("user", "请为当前的单元功能生成完整的测试用例，覆盖边界条件与异常处理。", 1440),
      mockMessage(
        "assistant",
        `### 测试用例设计

- **正常路径**：验证核心逻辑的正确输出。
- **边界条件**：空输入、超长输入、重复调用。
- **异常处理**：模拟 IPC 失败与非法参数。

\`\`\`typescript
describe("calculateTotal", () => {
  it("返回空数组时结果为 0", () => {
    expect(calculateTotal([])).toBe(0)
  })
  it("包含负数时正确累加", () => {
    expect(calculateTotal([1, -2, 3])).toBe(2)
  })
})
\`\`\`

需要我继续补充异步场景的用例吗？`,
        1439,
      ),
    ],
  },
  {
    id: "mock-chat-markdown",
    title: "Markdown 渲染机制",
    createdAt: now - 3 * 24 * 60 * MINUTE,
    messages: [
      mockMessage("user", "介绍一下 LxMarkdown 的渲染与编辑机制。", 4320),
      mockMessage(
        "assistant",
        `### LxMarkdown 双栏能力

- **编辑**：基于 CodeMirror 6 的实时编辑器，支持表格插入、快捷键与页面管理。
- **预览**：独立渲染进程内完成 Markdown → HTML，支持代码高亮。

编辑与预览通过 \`LxMarkdownEditor\` 统一编排，工具栏动作走 \`MarkdownToolbarAction\` 类型协议。`,
        4319,
      ),
    ],
  },
]
