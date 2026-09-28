import type { CollaborationMode, PromptTemplateItem, SkillItem } from "@shared/contracts/agent"
import type { TranslationKey } from "@/i18n"
import { COLLABORATION_MODE_META } from "@/lib/collaborationModes"
import type {
  AgentInputCommand,
  ClawMentionCandidate,
  McpMentionCandidate,
} from "../AgentInputCommandPanels"

// 历史提示词命令名（二级面板入口）。
export const HISTORY_PROMPT_COMMAND = "/historyPrompt"

// 内置命令元数据：argumentHint 统一使用 `-` 前缀占位符；requiredArgument 标记是否必须补参。
export const BUILTIN_COMMAND_KEYS: {
  id: string
  name: string
  descKey: TranslationKey
  kind: "builtin"
  argumentHint?: string
  argumentPlaceholder?: string
  requiredArgument?: boolean
}[] = [
  { id: "clear", name: "/clear", descKey: "agent.commandClearDesc", kind: "builtin" },
  { id: "undo", name: "/undo", descKey: "agent.commandUndoDesc", kind: "builtin" },
  {
    id: "steer",
    name: "/steer",
    descKey: "agent.commandSteerDesc",
    kind: "builtin",
    argumentHint: "-prompt",
    argumentPlaceholder: "prompt",
    requiredArgument: true,
  },
  {
    id: "btw",
    name: "/btw",
    descKey: "agent.commandBtwDesc",
    kind: "builtin",
    argumentHint: "-prompt",
    argumentPlaceholder: "prompt",
    requiredArgument: true,
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
    argumentHint: "-path",
    argumentPlaceholder: "path",
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
    argumentHint: "-html | -md | -json",
  },
  {
    id: "copy",
    name: "/copy",
    descKey: "agent.commandCopyDesc",
    kind: "builtin",
    argumentHint: "-all",
  },
  {
    id: "historyPrompt",
    name: HISTORY_PROMPT_COMMAND,
    descKey: "agent.commandHistoryPromptDesc",
    kind: "builtin",
    argumentHint: "-query",
    argumentPlaceholder: "query",
  },
]

// 内置命令的别名（校验与面板匹配共用）。
const BUILTIN_COMMAND_ALIASES: Record<string, string[]> = {
  clear: ["clear", "new"],
  session: ["session", "resume"],
}

// 斜杠命令名（不含 `/`）后必须紧跟空白或末尾，token 内出现第二个 `/` 视为普通文本（如路径）。
const SLASH_COMMAND_NAME_RE = /^\/([A-Za-z0-9_-]+)(?=\s|$)/

/**
 * 解析文本开头的斜杠命令名；非命令形态（含 `/usr/local` 这类路径）返回 null。
 */
export const parseSlashCommandName = (text: string): string | null => {
  const match = SLASH_COMMAND_NAME_RE.exec(text.trim())
  return match ? match[1] : null
}

/**
 * 命令名是否命中内置命令集合（含别名）或额外命令名（如 prompt 模板名）。
 */
export const isKnownCommandName = (name: string, extraNames: readonly string[] = []): boolean => {
  const normalized = name.toLowerCase()
  const builtinHit = BUILTIN_COMMAND_KEYS.some((command) => {
    const rawName = command.name.replace(/^\//, "").toLowerCase()
    if (rawName === normalized) return true
    return (BUILTIN_COMMAND_ALIASES[command.id] ?? []).includes(normalized)
  })
  if (builtinHit) return true
  return extraNames.some((extra) => extra.replace(/^\//, "").toLowerCase() === normalized)
}

/**
 * 解析命令后携带的参数文本：剥掉命令名后的分隔符（空白/冒号/首个 `-`）。
 * commandName 可带或不带前导 `/`。
 */
export const getCommandArgumentText = (text: string, commandName: string): string => {
  const escaped = commandName.replace(/^\//, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const prefixRe = new RegExp(`^/${escaped}(?=$|[\\s:-])`, "i")
  const trimmed = text.trim()
  if (!prefixRe.test(trimmed)) return ""
  return trimmed
    .replace(prefixRe, "")
    .replace(/^[\s:]*-\s*/, "")
    .replace(/^[\s:]+/, "")
    .trim()
}

/**
 * 占位词未编辑时视为未填写（仅 `-` 语法；`[prompt]` 等旧写法按字面文本处理）。
 */
export const collapsePlaceholderArgument = (arg: string, placeholder?: string): string => {
  const trimmed = arg.trim()
  if (placeholder && trimmed === placeholder.toLowerCase()) return ""
  return trimmed
}

/**
 * 返回必填参数缺失的内置命令（当前为 /steer、/btw）；参数已填写时返回 null。
 */
export const getMissingRequiredCommand = (
  text: string,
): { id: string; name: string; placeholder: string } | null => {
  const name = parseSlashCommandName(text)
  if (!name) return null
  const command = BUILTIN_COMMAND_KEYS.find(
    (item) =>
      item.requiredArgument &&
      (item.name.replace(/^\//, "").toLowerCase() === name.toLowerCase() ||
        (BUILTIN_COMMAND_ALIASES[item.id] ?? []).includes(name.toLowerCase())),
  )
  if (!command?.argumentPlaceholder) return null
  const arg = collapsePlaceholderArgument(
    getCommandArgumentText(text, command.name.replace(/^\//, "")),
    command.argumentPlaceholder,
  )
  if (arg) return null
  return { id: command.id, name: command.name, placeholder: command.argumentPlaceholder }
}

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

// @ 提及面板的 OpenClaw 种类 tag 文本。
export const CLAW_MENTION_TAG = "claw"

// @ 提及面板的 MCP 种类 tag 文本。
export const MCP_MENTION_TAG = "mcp"

// 子代理内置/自定义 tag 的英文兜底（与当前语言的本地化 tag 同时匹配）。
export const SUBAGENT_BUILTIN_TAG_FALLBACK = "agent"
export const SUBAGENT_CUSTOM_TAG_FALLBACK = "custom"

/**
 * `@claw` 提及候选过滤（AgentInput 与 OpenClaw 输入框共用同一规则）：
 * - tag 模糊命中种类名时整类返回（如 `@cla`）；
 * - `claw:` / `claw/` 前缀裁掉后按员工名、agentId、实例 id/名与 `instanceId/agentId` 过滤；
 * - 其余查询直接按上述字段过滤。
 */
export const filterClawMentionCandidates = (
  candidates: readonly ClawMentionCandidate[],
  query: string,
): readonly ClawMentionCandidate[] => {
  const raw = query.toLowerCase()
  if (!raw.startsWith(CLAW_MENTION_TAG) && isKindTagMatch(raw, CLAW_MENTION_TAG)) {
    return candidates
  }
  let keyword = raw
  if (keyword.startsWith(CLAW_MENTION_TAG)) {
    keyword = keyword.slice(CLAW_MENTION_TAG.length).replace(/^[:/]+/, "")
  }
  if (!keyword) return candidates
  return candidates.filter(
    (candidate) =>
      isFuzzyMatch(keyword, candidate.name.toLowerCase()) ||
      isFuzzyMatch(keyword, candidate.agentId.toLowerCase()) ||
      isFuzzyMatch(keyword, candidate.instanceId.toLowerCase()) ||
      isFuzzyMatch(keyword, candidate.instanceName.toLowerCase()) ||
      isFuzzyMatch(keyword, `${candidate.instanceId}/${candidate.agentId}`.toLowerCase()),
  )
}

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

// 过滤协作模式候选。
export const filterAgentModeMentionCandidates = (
  modes: readonly CollaborationMode[],
  query: string,
  t: (key: TranslationKey) => string,
): { mode: CollaborationMode; label: string; description: string }[] => {
  const q = query.toLowerCase().trim()
  if (q.startsWith("claw") || q.startsWith("agent:")) return []

  const keyword = q.replace(/^(agentmode|mode):?/, "")

  return modes
    .map((mode) => {
      const meta = COLLABORATION_MODE_META[mode]
      return {
        mode,
        label: t(meta.labelKey),
        description: t(meta.descKey),
      }
    })
    .filter((item) => {
      if (!keyword) return true
      return (
        isFuzzyMatch(keyword, item.mode.toLowerCase()) ||
        isFuzzyMatch(keyword, item.label.toLowerCase()) ||
        isFuzzyMatch(keyword, `agentmode:${item.mode}`)
      )
    })
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

// @ 提及面板的 MCP 候选：空查询展示全部，`mcp` / `mcp:` / `mcp/` 前缀按 server 名过滤，其余查询仅 tag 命中时整类返回。
export const getMentionMcpCandidates = (
  candidates: readonly McpMentionCandidate[],
  query: string,
): McpMentionCandidate[] => {
  const normalizedQuery = normalizeTagQuery(query)
  if (!normalizedQuery) return [...candidates]
  if (!normalizedQuery.startsWith(MCP_MENTION_TAG)) {
    return isKindTagMatch(normalizedQuery, MCP_MENTION_TAG) ? [...candidates] : []
  }
  const keyword = normalizedQuery.slice(MCP_MENTION_TAG.length).replace(/^[:/]+/, "")
  if (!keyword) return [...candidates]
  return candidates.filter((candidate) => isFuzzyMatch(keyword, candidate.name.toLowerCase()))
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

/**
 * 解析 /export 参数为导出格式；无法识别时返回 null（调用方提示重选）。
 * 空参数默认 html；调用方需自行拦截「显式写了 `-` 但没选值」的情况。
 */
export const resolveExportFormat = (rawArg: string): "html" | "markdown" | "jsonl" | null => {
  const arg = rawArg.trim().toLowerCase()
  if (!arg) return "html"
  if (arg === "md" || arg.startsWith("markdown")) return "markdown"
  if (arg === "json" || arg.startsWith("jsonl")) return "jsonl"
  if (arg.startsWith("html")) return "html"
  return null
}

// /export 二级格式选项：name 为用户输入 token，id 为导出格式值。
export const EXPORT_FORMAT_OPTIONS: {
  id: "html" | "markdown" | "jsonl"
  name: string
  label: string
}[] = [
  { id: "html", name: "html", label: "HTML" },
  { id: "markdown", name: "md", label: "Markdown" },
  { id: "jsonl", name: "json", label: "JSONL" },
]

export const getMatchedCommands = (
  value: string,
  templates: PromptTemplateItem[] = [],
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  allowProjectChange = true,
  canUseBtw = true,
): AgentInputCommand[] => {
  if (!value.startsWith("/")) return []

  // /export 二级格式面板：`/export -`、`/export ` 或 `/export -md` 列出可选格式。
  const exportMatch = /^\/export(?:[:\s-]+)(.*)$/i.exec(value)
  if (exportMatch) {
    const query = exportMatch[1].trim().toLowerCase()
    return EXPORT_FORMAT_OPTIONS.filter((option) => !query || isFuzzyMatch(query, option.name)).map(
      (option) => ({
        id: `export:${option.id}`,
        name: option.name,
        description: t("agent.exportFormatDesc", { format: option.label }),
        kind: "builtin" as const,
      }),
    )
  }

  if (/\s/.test(value)) return []
  const query = value.slice(1).toLowerCase()

  const builtinCommands: AgentInputCommand[] = BUILTIN_COMMAND_KEYS.filter(
    (cmd) => (cmd.id !== "project" || allowProjectChange) && (cmd.id !== "btw" || canUseBtw),
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
  // `-占位词` 形式：选中占位词本体（不含 `-`）。
  const dashIndex = insertText.indexOf("-", commandNameLength)
  if (dashIndex !== -1) {
    const start = dashIndex + 1
    const wordMatch = /^[^\s|]+/.exec(insertText.slice(start))
    if (wordMatch && wordMatch[0].length > 0) {
      return { anchor: start, head: start + wordMatch[0].length }
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

export { cleanUserPrompt } from "@/features/agent/utils"
