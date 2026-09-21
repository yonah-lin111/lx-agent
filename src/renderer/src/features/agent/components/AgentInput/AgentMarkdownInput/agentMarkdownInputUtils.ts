import type { PromptTemplateItem, SkillItem } from "@shared/contracts/agent"
import type { TranslationKey } from "@/i18n"
import type { AgentInputCommand } from "../AgentInputCommandPanels"

// 历史提示词命令名（二级面板入口）。
export const HISTORY_PROMPT_COMMAND = "/historyPrompt"

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
  {
    id: "historyPrompt",
    name: HISTORY_PROMPT_COMMAND,
    descKey: "agent.commandHistoryPromptDesc",
    kind: "builtin",
    argumentHint: "[query]",
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

// @ 提及面板的 Skill 种类 tag 文本。
export const SKILL_MENTION_TAG = "skill"

// @ 提及面板的 Design 种类 tag 文本。
export const DESIGN_MENTION_TAG = "design"

// @ 提及面板的 OpenClaw 种类 tag 文本。
export const CLAW_MENTION_TAG = "claw"

// 子代理内置/自定义 tag 的英文兜底（与当前语言的本地化 tag 同时匹配）。
export const SUBAGENT_BUILTIN_TAG_FALLBACK = "agent"
export const SUBAGENT_CUSTOM_TAG_FALLBACK = "custom"

/**
 * 归一化 tag 查询：去首尾空格并小写，中文不受影响。
 */
export const normalizeTagQuery = (query: string): string => query.trim().toLowerCase()

/**
 * 查询是否模糊命中 tag 文本。
 */
export const isKindTagMatch = (query: string, tagLabel: string): boolean => {
  const normalizedQuery = normalizeTagQuery(query)
  if (!normalizedQuery) return true
  return isFuzzyMatch(normalizedQuery, tagLabel.trim().toLowerCase())
}

// 按名称、显示名、短描述与描述模糊过滤 Skill。
export const filterSkillsByQuery = (skills: SkillItem[], query: string): SkillItem[] => {
  if (!query) return skills
  return skills.filter(
    (s) =>
      isFuzzyMatch(query, s.name.toLowerCase()) ||
      (s.displayName && isFuzzyMatch(query, s.displayName.toLowerCase())) ||
      (s.shortDescription && isFuzzyMatch(query, s.shortDescription.toLowerCase())) ||
      isFuzzyMatch(query, s.description.toLowerCase()),
  )
}

// @ 提及面板的 Skill 候选：空查询展示全部，`skill` / `skill:` 前缀按余量过滤，其余查询仅 tag 命中时整类返回。
export const getMentionSkillCandidates = (skills: SkillItem[], query: string): SkillItem[] => {
  const normalizedQuery = normalizeTagQuery(query)
  if (!normalizedQuery) return skills
  if (!normalizedQuery.startsWith(SKILL_MENTION_TAG)) {
    return isKindTagMatch(normalizedQuery, SKILL_MENTION_TAG) ? skills : []
  }
  const keyword = normalizedQuery.replace(/^skill:?/, "")
  if (!keyword) return skills
  return filterSkillsByQuery(skills, keyword)
}

/**
 * 子代理候选的展示 tag 是否被查询命中：同时匹配当前语言 tag 与英文兜底。
 */
export const isSubagentTagMatch = (
  query: string,
  builtIn: boolean,
  builtInLabel: string,
  customLabel: string,
): boolean => {
  const normalizedQuery = normalizeTagQuery(query)
  if (!normalizedQuery) return true
  const primary = (builtIn ? builtInLabel : customLabel).trim().toLowerCase()
  const fallback = builtIn ? SUBAGENT_BUILTIN_TAG_FALLBACK : SUBAGENT_CUSTOM_TAG_FALLBACK
  return isFuzzyMatch(normalizedQuery, primary) || isFuzzyMatch(normalizedQuery, fallback)
}

/**
 * 读取命令的展示 tag 文本，与 AgentInputCommandPanel 的 getCommandTags 保持一致。
 */
export const getCommandTagLabel = (command: Pick<AgentInputCommand, "kind" | "source">): string => {
  if (command.kind === "skill") return "Skill"
  if (command.kind === "prompt") {
    return command.source === "project" ? "Custom|Project" : "Custom|Global"
  }
  return "Builtin"
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
    if (aliases.some((alias) => isFuzzyMatch(query, alias))) return true
    // tag 文本参与过滤：与名称取并集，不匹配描述，不改变排序。
    return isFuzzyMatch(query, getCommandTagLabel(command).toLowerCase())
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
