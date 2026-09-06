import type { PromptTemplateItem } from "@shared/contracts/agent"
import type { TranslationKey } from "@/i18n"
import type { AgentInputCommand } from "./AgentInputCommandPanels"

export const BUILTIN_COMMAND_KEYS: {
  id: string
  name: string
  descKey: TranslationKey
  kind: "builtin"
  argumentHint?: string
}[] = [
  { id: "clear", name: "/clear", descKey: "agent.commandClearDesc", kind: "builtin" },
  { id: "undo", name: "/undo", descKey: "agent.commandUndoDesc", kind: "builtin" },
  {
    id: "steer",
    name: "/steer",
    descKey: "agent.commandSteerDesc",
    kind: "builtin",
    argumentHint: "[prompt]",
  },
  { id: "model", name: "/model", descKey: "agent.commandModelDesc", kind: "builtin" },
  {
    id: "gitWorktree",
    name: "/gitWorktree",
    descKey: "agent.commandGitWorktreeDesc",
    kind: "builtin",
  },
  { id: "compact", name: "/compact", descKey: "agent.commandCompactDesc", kind: "builtin" },
  {
    id: "export",
    name: "/export",
    descKey: "agent.commandExportDesc",
    kind: "builtin",
    argumentHint: "[html | md | json]",
  },
  {
    id: "copy",
    name: "/copy",
    descKey: "agent.commandCopyDesc",
    kind: "builtin",
    argumentHint: "[all]",
  },
]

export const isFuzzyMatch = (query: string, keyword: string): boolean => {
  if (!query) return true
  let queryIndex = 0
  for (const character of keyword) {
    if (character === query[queryIndex]) queryIndex += 1
    if (queryIndex === query.length) return true
  }
  return false
}

export const getMatchedCommands = (
  value: string,
  templates: PromptTemplateItem[] = [],
  t: (key: TranslationKey) => string,
): AgentInputCommand[] => {
  if (!value.startsWith("/") || /\s/.test(value)) return []
  const query = value.slice(1).toLowerCase()

  const builtinCommands: AgentInputCommand[] = BUILTIN_COMMAND_KEYS.map((cmd) => ({
    id: cmd.id,
    name: cmd.name,
    description: t(cmd.descKey),
    kind: cmd.kind,
    argumentHint: cmd.argumentHint,
  }))

  const templateCommands: AgentInputCommand[] = templates.map((t) => ({
    id: `prompt:${t.name}`,
    name: `/${t.name}`,
    description: t.description,
    kind: "prompt",
    source: t.source,
    argumentHint: t.argumentHint,
  }))

  const allCommands = [...builtinCommands, ...templateCommands]

  return allCommands.filter((command) => {
    const rawName = command.name.replace(/^\//, "").toLowerCase()
    const aliases = command.id === "clear" ? ["clear", "new"] : [rawName]
    return (
      aliases.some((alias) => isFuzzyMatch(query, alias)) ||
      isFuzzyMatch(query, command.description.toLowerCase())
    )
  })
}

export const getArgumentSelectionRange = (
  insertText: string,
  commandNameLength: number,
): { anchor: number; head: number } => {
  const startBracket = insertText.indexOf("[", commandNameLength)
  if (startBracket !== -1) {
    const endBracket = insertText.indexOf("]", startBracket)
    if (endBracket !== -1 && endBracket > startBracket + 1) {
      return { anchor: startBracket, head: endBracket + 1 }
    }
  }
  return { anchor: commandNameLength + 1, head: insertText.length }
}

export const getMentionQuery = (
  value: string,
  cursor: number,
): { start: number; query: string } | null => {
  const beforeCursor = value.slice(0, cursor)
  const start = beforeCursor.lastIndexOf("@")
  if (start < 0 || (start > 0 && !/\s/.test(beforeCursor[start - 1] ?? ""))) return null
  const query = value.slice(start + 1, cursor)
  if (/[\s\n]/.test(query)) return null
  return { start, query }
}

export const getSkillMentionQuery = (
  value: string,
  cursor: number,
): { start: number; query: string } | null => {
  const beforeCursor = value.slice(0, cursor)
  const start = beforeCursor.lastIndexOf("$")
  if (start < 0 || (start > 0 && !/\s/.test(beforeCursor[start - 1] ?? ""))) return null
  const query = value.slice(start + 1, cursor)
  if (/[\s\n]/.test(query)) return null
  return { start, query }
}
