import type { AgentInputCommand } from "@/features/agent/components/AgentInput"
import { isFuzzyMatch } from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"
import type { TranslationKey } from "@/i18n"

// OpenClaw 输入框支持的内置命令。
export type OpenClawCommandId = "clear" | "stop" | "office" | "only" | "all"

interface OpenClawCommandSpec {
  id: OpenClawCommandId
  name: string
  descKey: TranslationKey
  // 应用命令时保留输入文本，允许在命令后追加参数（如 `/clear lily & lucy`）。
  keepText?: boolean
}

export const OPENCLAW_COMMANDS: readonly OpenClawCommandSpec[] = [
  { id: "clear", name: "/clear", descKey: "openclaw.commandClearDesc", keepText: true },
  { id: "stop", name: "/stop", descKey: "openclaw.commandStopDesc" },
  { id: "office", name: "/office", descKey: "openclaw.commandOfficeDesc" },
  { id: "only", name: "/only", descKey: "openclaw.commandOnlyDesc", keepText: true },
  { id: "all", name: "/all", descKey: "openclaw.commandAllDesc" },
]

// 判断命令应用时是否保留输入文本（支持追加参数）。
export const keepsCommandText = (commandId: OpenClawCommandId): boolean =>
  OPENCLAW_COMMANDS.some((command) => command.id === commandId && command.keepText === true)

// 命令可见性：由页面状态决定（`/only` 需要多名员工才有意义，`/all` 只在筛选态可用）。
export interface OpenClawCommandCapabilities {
  canOnly: boolean
  canRestore: boolean
}

// 缺省全部可见：未传 capabilities 的调用方保持既有行为。
const DEFAULT_CAPABILITIES: OpenClawCommandCapabilities = { canOnly: true, canRestore: true }

const isCommandAvailable = (
  commandId: OpenClawCommandId,
  capabilities: OpenClawCommandCapabilities,
): boolean => {
  if (commandId === "only") return capabilities.canOnly
  if (commandId === "all") return capabilities.canRestore
  return true
}

/**
 * 匹配 OpenClaw 命令面板候选（仅 `/` 开头且无空格时触发）。
 */
export const getMatchedOpenClawCommands = (
  value: string,
  t: (key: TranslationKey) => string,
  capabilities: OpenClawCommandCapabilities = DEFAULT_CAPABILITIES,
): AgentInputCommand[] => {
  if (!value.startsWith("/") || /\s/.test(value)) return []
  const query = value.slice(1).toLowerCase()
  return OPENCLAW_COMMANDS.filter(
    (command) =>
      isCommandAvailable(command.id, capabilities) &&
      (isFuzzyMatch(query, command.name.slice(1)) ||
        isFuzzyMatch(query, t(command.descKey).toLowerCase())),
  ).map((command) => ({
    id: command.id,
    name: command.name,
    description: t(command.descKey),
    kind: "builtin",
  }))
}

export interface ParsedOpenClawCommand {
  id: OpenClawCommandId
  // 命令名之后的参数文本（不含前导空格）。
  args: string
}

/**
 * 解析 OpenClaw 内置命令与其参数（如 `/clear lily & lucy`）。
 */
export const parseOpenClawCommand = (value: string): ParsedOpenClawCommand | null => {
  const trimmed = value.trim()
  if (!trimmed.startsWith("/")) return null
  const spaceIndex = trimmed.search(/\s/)
  const name = (spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex)).toLowerCase()
  const matched = OPENCLAW_COMMANDS.find((command) => command.name === name)
  if (!matched) return null
  const args = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim()
  return { id: matched.id, args }
}

// 拆分命令参数中的员工名称（`&` 分隔，去空）。
export const splitCommandAgentNames = (args: string): string[] =>
  args
    .split("&")
    .map((name) => name.trim())
    .filter((name) => name.length > 0)

/**
 * 在命令（`/clear`、`/only`）的参数中追加/移除一个员工名称，返回新的输入文本。
 */
export const toggleCommandAgentName = (
  current: string,
  commandId: OpenClawCommandId,
  name: string,
): string => {
  const command = parseOpenClawCommand(current)
  const names = command?.id === commandId ? splitCommandAgentNames(command.args) : []
  const lowerName = name.trim().toLowerCase()
  const exists = names.some((item) => item.toLowerCase() === lowerName)
  const next = exists
    ? names.filter((item) => item.toLowerCase() !== lowerName)
    : [...names, name.trim()].filter((item) => item.length > 0)
  const commandName =
    OPENCLAW_COMMANDS.find((item) => item.id === commandId)?.name ?? `/${commandId}`
  return next.length === 0 ? commandName : `${commandName} ${next.join(" & ")}`
}
