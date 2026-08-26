import type { SuggestedQuestionContextMessage } from "@shared/contracts/agent"

export const SKILL_TOOL_NAME = "read_skill"
export const WEB_SEARCH_TOOL_NAME = "web_search"
export const SUBAGENT_TOOL_NAME = "task"
export const TODO_TOOL_NAME = "todowrite"
export const QUESTION_TOOL_NAME = "question"
export const VISUAL_TOOL_NAMES = new Set(["render_svg", "render_ascii", "render_html"])

// 稳定的空上下文（避免每次渲染新数组导致 hook effect 依赖变化触发无限重渲染）。
export const EMPTY_SUGGESTED_QUESTION_CONTEXT: SuggestedQuestionContextMessage[] = []

// 内置下划线工具名集合（用于区分是否为 MCP 调用）。
export const BUILTIN_UNDERSCORE_TOOLS = new Set([
  "web_search",
  "apply_patch",
  "read_skill",
  "job_output",
  "job_list",
  "job_kill",
])
