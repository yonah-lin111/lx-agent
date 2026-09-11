// OpenClaw 提及（@claw:<instanceId>/<agentId>）的解析与派发目标解析。
// 说明：该逻辑属于 OpenClaw 领域，agent 输入框与 OpenClaw 页面共用，避免重复实现。

export interface ClawMention {
  instanceId: string
  agentId: string
  fullMatch: string
  start: number
  end: number
}

/**
 * 提取 `@claw:<instanceId>/<agentId>` 提及；可带 ` (name)` 显示后缀。
 */
export const extractClawMentions = (text: string): ClawMention[] => {
  const regex = /(?<![\w\[])@claw:([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)(?:\s*\(([^()\r\n]*)\))?/g
  const matches: ClawMention[] = []
  let match: RegExpExecArray | null = null
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      instanceId: match[1],
      agentId: match[2],
      fullMatch: match[0],
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return matches
}

/**
 * 移除提及文本，返回剩余的任务正文。
 */
export const stripClawMention = (text: string, mention: ClawMention): string =>
  `${text.slice(0, mention.start)}${text.slice(mention.end)}`.trim()

/**
 * 移除所有提及文本，返回剩余的任务正文。
 */
export const stripClawMentions = (text: string): string =>
  extractClawMentions(text)
    .reverse()
    .reduce((acc, mention) => `${acc.slice(0, mention.start)}${acc.slice(mention.end)}`, text)
    .trim()

export interface ClawMentionDeletionRange {
  from: number
  to: number
}

/**
 * 计算光标处于 `@claw:` 提及末尾时的整块快速删除范围：
 * - 光标紧贴提及末尾（含 ` (name)` 后缀）时整块删除，若紧邻单个空格一并移除；
 * - 光标位于末尾单个空格之后时，一并删除该空格；
 * - 光标处于 Token 内部时返回 null，降级为默认单字符编辑。
 */
export const getClawMentionDeletionRange = (
  text: string,
  cursor: number,
): ClawMentionDeletionRange | null => {
  for (const mention of extractClawMentions(text)) {
    if (cursor === mention.end) {
      return { from: mention.start, to: text[cursor] === " " ? cursor + 1 : cursor }
    }
    if (cursor === mention.end + 1 && text[mention.end] === " ") {
      return { from: mention.start, to: cursor }
    }
    if (cursor > mention.start && cursor < mention.end) return null
  }
  return null
}

export interface ClawDispatchTargets {
  // 归一化后的任务正文（已剔除提及）。
  body: string
  // 本次消息的扇出目标 agentId 列表（顺序稳定、去重）。
  agentIds: string[]
}

/**
 * 解析一条输入的任务正文与扇出目标：
 * - 文本中存在 `@claw:` 提及时，以提及目标为准（仅保留当前办公区内的 agent）；
 * - 否则回退到当前选中的员工集合；
 * - 目标按出现/选择顺序去重。
 */
export const resolveClawDispatchTargets = (
  text: string,
  officeAgentIds: readonly string[],
  selectedAgentIds: readonly string[],
): ClawDispatchTargets => {
  const officeSet = new Set(officeAgentIds)
  const mentions = extractClawMentions(text)
  const mentioned = mentions
    .map((mention) => mention.agentId)
    .filter((agentId) => officeSet.has(agentId))
  const targets =
    mentioned.length > 0 ? mentioned : selectedAgentIds.filter((id) => officeSet.has(id))

  const seen = new Set<string>()
  const agentIds: string[] = []
  for (const agentId of targets) {
    if (seen.has(agentId)) continue
    seen.add(agentId)
    agentIds.push(agentId)
  }

  return { body: mentions.length > 0 ? stripClawMentions(text) : text.trim(), agentIds }
}
