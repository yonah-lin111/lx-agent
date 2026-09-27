// MCP server 提及（@mcp:<name>）的匹配与删除范围计算。

// server 名格式：字母/数字开头，仅含字母/数字/下划线/连字符，最长 64 字符。
export const MCP_SERVER_NAME_PATTERN_SRC = String.raw`[A-Za-z0-9][A-Za-z0-9_-]{0,63}`

// 提及后的常见标点作为 token 边界，不参与提及高亮。
export const MARKDOWN_MCP_MENTION_PATTERN = new RegExp(
  String.raw`(?<![\w\[])@mcp:(${MCP_SERVER_NAME_PATTERN_SRC})(?=$|[\s.,;:!?，。；：！？、()\[\]{}])`,
  "gu",
)

export interface McpMention {
  name: string
  fullMatch: string
  start: number
  end: number
}

/**
 * 提取 `@mcp:<name>` 提及。
 */
export const extractMcpMentions = (text: string): McpMention[] => {
  MARKDOWN_MCP_MENTION_PATTERN.lastIndex = 0
  const matches: McpMention[] = []
  let match: RegExpExecArray | null = null
  while ((match = MARKDOWN_MCP_MENTION_PATTERN.exec(text)) !== null) {
    matches.push({
      name: match[1],
      fullMatch: match[0],
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return matches
}

export interface McpMentionDeletionRange {
  from: number
  to: number
}

/**
 * 计算光标处于 `@mcp:` 提及末尾时的整块快速删除范围：
 * - 光标紧贴提及末尾时整块删除，若紧邻单个空格一并移除；
 * - 光标位于末尾单个空格之后时，一并删除该空格；
 * - 光标处于 Token 内部时返回 null，降级为默认单字符编辑。
 */
export const getMcpMentionDeletionRange = (
  text: string,
  cursor: number,
): McpMentionDeletionRange | null => {
  for (const mention of extractMcpMentions(text)) {
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
