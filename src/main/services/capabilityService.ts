import { readFileSync } from "node:fs"
import type { AgentCapabilitySnapshot } from "@shared/contracts/agent"
import { getConfigPath } from "@/paths"

// 项目 item 会话缺省能力集：内置工具全集（含联网搜索）。
export const DEFAULT_ITEM_TOOLS = [
  "read",
  "ls",
  "grep",
  "find",
  "write",
  "edit",
  "bash",
  "time",
  "web_search",
]

// 非项目页面缺省能力集：最小只读集 + 联网搜索。
const DEFAULT_PAGE_TOOLS = ["read", "time", "web_search"]

// 原始 config.json 的 agent.pages 配置。
type RawPageCapabilities = {
  tools?: unknown
  mcp?: unknown
  skills?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

// 读取 config.json 的 agent.pages 节点；缺失或非法时返回空表。
const readAgentPages = (): Record<string, RawPageCapabilities> => {
  try {
    const raw = JSON.parse(readFileSync(getConfigPath(), "utf8")) as unknown
    if (!isRecord(raw) || !isRecord(raw.agent)) return {}
    const pages = raw.agent.pages
    return isRecord(pages) ? (pages as Record<string, RawPageCapabilities>) : {}
  } catch {
    return {}
  }
}

/**
 * 解析页面路由的默认能力集：config.json `agent.pages[route]` 优先；
 * 未配置或非法（非对象）时回退最小只读集（read / time）。
 */
export const getPageCapabilities = (route: string): AgentCapabilitySnapshot => {
  const page = readAgentPages()[route]
  if (!page || !isRecord(page)) {
    return { tools: [...DEFAULT_PAGE_TOOLS], mcp: [], skills: [] }
  }
  return {
    tools: toStringArray(page.tools),
    mcp: toStringArray(page.mcp),
    skills: toStringArray(page.skills),
  }
}

/**
 * 解析项目 item 会话的默认能力集：内置工具全集 + 空 mcp/skills。
 */
export const getItemCapabilities = (): AgentCapabilitySnapshot => ({
  tools: [...DEFAULT_ITEM_TOOLS],
  mcp: [],
  skills: [],
})
