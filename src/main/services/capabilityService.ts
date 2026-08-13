import type { AgentCapabilitySnapshot } from "@shared/contracts/agent"

// 全量内置工具集（含联网搜索、原文抓取、提问、子代理委托与 LSP 语义检索）：所有会话一律启用，无页面/项目裁剪。
export const DEFAULT_TOOLS = [
  "read",
  "ls",
  "grep",
  "find",
  "write",
  "edit",
  "bash",
  "time",
  "todowrite",
  "web_search",
  "webfetch",
  "task",
  "question",
  "lsp",
]

/**
 * 默认能力快照：内置工具全集 + 空 mcp/skills。
 * 实际 MCP/skill 装配由 agentRunner 从管理器全量取，此处不承载配置解析。
 */
export const getDefaultCapabilities = (): AgentCapabilitySnapshot => ({
  tools: [...DEFAULT_TOOLS],
  mcp: [],
  skills: [],
})
