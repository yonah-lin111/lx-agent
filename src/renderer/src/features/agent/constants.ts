import type { AgentPromptCard } from "./types"

// 支持连续调用合并展示的工具及其条目分隔符。
// 各工具分隔符刻意不同，便于在折叠组中区分条目来源；read 使用全角顿号。
export const TOOL_GROUP_SEPARATORS: Record<string, string> = {
  read: "、",
  ls: " ; ",
  grep: " | ",
  find: " , ",
  bash: " & ",
  lsp: " · ",
}

// 默认预设提示词列表。
export const DEFAULT_PROMPT_CARDS: AgentPromptCard[] = [
  {
    id: "analyze-code",
    title: "Code Refactoring",
    description: "Analyze structure and provide optimization suggestions",
    prompt:
      "Help me analyze and refactor the code in the current module to improve maintainability and testability.",
  },
  {
    id: "write-tests",
    title: "Generate Unit Tests",
    description: "Write comprehensive unit tests for core logic",
    prompt:
      "Generate complete unit test cases for the current feature, covering edge cases and error handling.",
  },
  {
    id: "explain-architecture",
    title: "Architecture Analysis",
    description: "Clarify module interactions and data flow",
    prompt:
      "Explain the three-process architecture and renderer feature-first organization of this project.",
  },
]
