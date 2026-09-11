import type { AgentInputCommand } from "@/features/agent/components/AgentInput"
import { isFuzzyMatch } from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"
import type { TranslationKey } from "@/i18n"

// OpenClaw 输入框支持的内置命令。
export type OpenClawCommandId = "clear" | "stop" | "agent" | "office"

interface OpenClawCommandSpec {
  id: OpenClawCommandId
  name: string
  descKey: TranslationKey
}

export const OPENCLAW_COMMANDS: readonly OpenClawCommandSpec[] = [
  { id: "clear", name: "/clear", descKey: "openclaw.commandClearDesc" },
  { id: "stop", name: "/stop", descKey: "openclaw.commandStopDesc" },
  { id: "agent", name: "/agent", descKey: "openclaw.commandAgentDesc" },
  { id: "office", name: "/office", descKey: "openclaw.commandOfficeDesc" },
]

/**
 * 匹配 OpenClaw 命令面板候选（仅 `/` 开头且无空格时触发）。
 */
export const getMatchedOpenClawCommands = (
  value: string,
  t: (key: TranslationKey) => string,
): AgentInputCommand[] => {
  if (!value.startsWith("/") || /\s/.test(value)) return []
  const query = value.slice(1).toLowerCase()
  return OPENCLAW_COMMANDS.filter(
    (command) =>
      isFuzzyMatch(query, command.name.slice(1)) ||
      isFuzzyMatch(query, t(command.descKey).toLowerCase()),
  ).map((command) => ({
    id: command.id,
    name: command.name,
    description: t(command.descKey),
    kind: "builtin",
  }))
}

/**
 * 判断一条完整输入是否为 OpenClaw 内置命令，是则返回命令 id。
 */
export const matchOpenClawCommand = (value: string): OpenClawCommandId | null => {
  const normalized = value.trim().toLowerCase()
  const matched = OPENCLAW_COMMANDS.find((command) => command.name === normalized)
  return matched?.id ?? null
}
