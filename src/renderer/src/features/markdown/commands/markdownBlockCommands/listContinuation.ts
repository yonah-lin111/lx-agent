import type { MarkdownListContinuation } from "./types"

/**
 * 解析当前行的 Markdown 列表项或引用块标记，计算回车时的续行前缀或空行退出状态。
 */
export const getMarkdownListContinuation = (lineText: string): MarkdownListContinuation | null => {
  // 分隔线不作为列表处理
  if (/^\s*(?:[-*_])(?:\s*[-*_]){2,}\s*$/.test(lineText)) {
    return null
  }

  // 1. 待办/任务列表：- [ ] 或 - [x]
  const taskMatch = /^(\s*)([-+*]\s+\[[ xX]\]\s*)(.*)$/.exec(lineText)
  if (taskMatch) {
    const isBlank = taskMatch[3].trim() === ""
    return {
      prefix: `${taskMatch[1]}- [ ] `,
      markerLength: taskMatch[1].length + taskMatch[2].length,
      empty: isBlank,
    }
  }

  // 2. 无序列表：- 或 * 或 +
  const unorderedMatch = /^(\s*)([-+*]\s+)(.*)$/.exec(lineText)
  if (unorderedMatch) {
    const isBlank = unorderedMatch[3].trim() === ""
    const marker = unorderedMatch[2].trim()
    return {
      prefix: `${unorderedMatch[1]}${marker} `,
      markerLength: unorderedMatch[1].length + unorderedMatch[2].length,
      empty: isBlank,
    }
  }

  // 3. 有序列表：1. 或 1)
  const orderedMatch = /^(\s*)(\d+)([.)]\s+)(.*)$/.exec(lineText)
  if (orderedMatch) {
    const isBlank = orderedMatch[4].trim() === ""
    const nextNum = Number.parseInt(orderedMatch[2], 10) + 1
    const delimiter = orderedMatch[3].trim()
    return {
      prefix: `${orderedMatch[1]}${nextNum}${delimiter} `,
      markerLength: orderedMatch[1].length + orderedMatch[2].length + orderedMatch[3].length,
      empty: isBlank,
    }
  }

  // 4. 引用块：>
  const quoteMatch = /^(\s*)(>+\s*)(.*)$/.exec(lineText)
  if (quoteMatch) {
    const isBlank = quoteMatch[3].trim() === ""
    return {
      prefix: `${quoteMatch[1]}${quoteMatch[2].trim()} `,
      markerLength: quoteMatch[1].length + quoteMatch[2].length,
      empty: isBlank,
    }
  }

  return null
}
