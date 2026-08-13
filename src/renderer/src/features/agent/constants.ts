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
