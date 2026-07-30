import type { AgentPromptCard } from "./types"

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
