// 协作模式提及（@agentMode:<mode>）的匹配与删除范围计算。

// 模式名格式：小写字母开头，仅含小写字母/数字/下划线/连字符，最长 32 字符。
export const AGENT_MODE_NAME_PATTERN_SRC = String.raw`[a-z][a-z0-9_-]{0,31}`

// 提及后的常见标点作为 token 边界，不参与提及高亮。
export const MARKDOWN_AGENT_MODE_MENTION_PATTERN = new RegExp(
  String.raw`(?<![\w\[])@agentMode:(${AGENT_MODE_NAME_PATTERN_SRC})(?=$|[\s.,;:!?，。；：！？、()\[\]{}])`,
  "gu",
)

export interface AgentModeMention {
  mode: string
  fullMatch: string
  start: number
  end: number
}

/**
 * 提取 `@agentMode:<mode>` 提及。
 */
export const extractAgentModeMentions = (text: string): AgentModeMention[] => {
  MARKDOWN_AGENT_MODE_MENTION_PATTERN.lastIndex = 0
  const matches: AgentModeMention[] = []
  let match: RegExpExecArray | null = null
  while ((match = MARKDOWN_AGENT_MODE_MENTION_PATTERN.exec(text)) !== null) {
    matches.push({
      mode: match[1],
      fullMatch: match[0],
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return matches
}

export interface AgentModeMentionDeletionRange {
  from: number
  to: number
}

/**
 * 计算光标处于 `@agentMode:` 提及末尾时的整块快速删除范围：
 * - 光标紧贴提及末尾时整块删除，若紧邻单个空格一并移除；
 * - 光标位于末尾单个空格之后时，一并删除该空格；
 * - 光标处于 Token 内部时返回 null，降级为默认单字符编辑。
 */
export const getAgentModeMentionDeletionRange = (
  text: string,
  cursor: number,
): AgentModeMentionDeletionRange | null => {
  for (const mention of extractAgentModeMentions(text)) {
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
