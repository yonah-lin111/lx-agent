import type { PromptTemplateItem } from "@shared/contracts/agent"
import type { TranslationKey } from "@/i18n"
import type { AgentInputCommand } from "../AgentInputCommandPanels"

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
  {
    id: "project",
    name: "/project",
    descKey: "agent.commandProjectDesc",
    kind: "builtin",
  },
  {
    id: "cd",
    name: "/cd",
    descKey: "agent.commandCdDesc",
    kind: "builtin",
    argumentHint: "[path]",
  },
  {
    id: "session",
    name: "/session",
    descKey: "agent.commandSessionDesc",
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
  allowProjectChange = true,
): AgentInputCommand[] => {
  if (!value.startsWith("/") || /\s/.test(value)) return []
  const query = value.slice(1).toLowerCase()

  const builtinCommands: AgentInputCommand[] = BUILTIN_COMMAND_KEYS.filter(
    (cmd) => cmd.id !== "project" || allowProjectChange,
  ).map((cmd) => ({
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
    const aliases =
      command.id === "clear"
        ? ["clear", "new"]
        : command.id === "session"
          ? ["session", "resume"]
          : [rawName]
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
    if (endBracket !== -1 && endBracket >= startBracket + 1) {
      return { anchor: startBracket + 1, head: endBracket }
    }
  }
  return { anchor: Math.min(commandNameLength + 1, insertText.length), head: insertText.length }
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

export interface DesignMention {
  id: string
  target?: string
  title?: string
  fullMatch: string
  start: number
  end: number
}

export const extractDesignMentions = (text: string): DesignMention[] => {
  const regex =
    /(?<![\w\[])@design:([a-zA-Z0-9_-]+)(?:#(?:(\[[^\]\r\n]+\])|([^\s()]+)))?(?:\s*\(([^()\r\n]*)\))?/g
  const matches: DesignMention[] = []
  let match: RegExpExecArray | null = null
  while ((match = regex.exec(text)) !== null) {
    const rawTarget = match[2] || match[3]
    matches.push({
      id: match[1],
      target: rawTarget?.trim() || undefined,
      title: match[4]?.trim() || undefined,
      fullMatch: match[0],
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return matches
}

export interface DesignTokenDeletionRange {
  from: number
  to: number
}

/**
 * 计算光标处于 @design 提及末尾时的整块快速删除范围。
 * 1. 光标紧贴末尾字符或右括号处（例如 `@design:... (span)|`）：整块删除，若后续紧邻单个空格一并移除。
 * 2. 光标位于末尾单个空格之后（例如 `@design:... (span) |`）：整块删除，包括该尾随空格。
 * 3. 光标处于 Token 内部：返回 null，降级为默认的单字符编辑。
 */
export const getDesignMentionDeletionRange = (
  text: string,
  cursor: number,
): DesignTokenDeletionRange | null => {
  const mentions = extractDesignMentions(text)
  for (const mention of mentions) {
    // 1. 光标紧贴末尾字符或右括号处
    if (cursor === mention.end) {
      const to = text[cursor] === " " ? cursor + 1 : cursor
      return { from: mention.start, to }
    }
    // 2. 光标在末尾单个空格之后
    if (cursor === mention.end + 1 && text[mention.end] === " ") {
      return { from: mention.start, to: cursor }
    }
    // 3. 光标在 Token 内部时降级
    if (cursor > mention.start && cursor < mention.end) {
      return null
    }
  }
  return null
}

export { cleanUserPrompt } from "@/features/agent/utils"
