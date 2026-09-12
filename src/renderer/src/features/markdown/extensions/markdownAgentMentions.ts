// 子代理角色提及（@agent:<name>）的匹配与删除范围计算。

// 角色名格式：小写字母开头，仅含小写字母/数字/下划线/连字符，最长 32 字符。
export const AGENT_NAME_PATTERN_SRC = String.raw`[a-z][a-z0-9_-]{0,31}`

// 提及后的常见标点作为 token 边界，不参与提及高亮。
export const MARKDOWN_AGENT_MENTION_PATTERN = new RegExp(
  String.raw`(?<![\w\[])@agent:(${AGENT_NAME_PATTERN_SRC})(?=$|[\s.,;:!?，。；：！？、()\[\]{}])`,
  "gu",
)

export interface AgentMention {
  name: string
  fullMatch: string
  start: number
  end: number
}

/**
 * 提取 `@agent:<name>` 提及。
 */
export const extractAgentMentions = (text: string): AgentMention[] => {
  MARKDOWN_AGENT_MENTION_PATTERN.lastIndex = 0
  const matches: AgentMention[] = []
  let match: RegExpExecArray | null = null
  while ((match = MARKDOWN_AGENT_MENTION_PATTERN.exec(text)) !== null) {
    matches.push({
      name: match[1],
      fullMatch: match[0],
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return matches
}

export interface AgentMentionDeletionRange {
  from: number
  to: number
}

/**
 * 计算光标处于 `@agent:` 提及末尾时的整块快速删除范围：
 * - 光标紧贴提及末尾时整块删除，若紧邻单个空格一并移除；
 * - 光标位于末尾单个空格之后时，一并删除该空格；
 * - 光标处于 Token 内部时返回 null，降级为默认单字符编辑。
 */
export const getAgentMentionDeletionRange = (
  text: string,
  cursor: number,
): AgentMentionDeletionRange | null => {
  for (const mention of extractAgentMentions(text)) {
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
