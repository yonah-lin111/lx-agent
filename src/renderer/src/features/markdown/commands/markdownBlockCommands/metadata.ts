import {
  MARKDOWN_SUPPLE_END_RE,
  MARKDOWN_TEMPLATE_END_RE,
  MARKDOWN_TEMPLATE_ID_RE,
  MARKDOWN_TEMPLATE_START_RE,
  MARKDOWN_TEMPLATE_WT_RE,
  parseMarkdownTemplateEndLine,
} from "./markers"
import type { MarkdownTemplateStatus, ParsedMarkdownSuppleEnd } from "./types"

// 模板块状态标记（源码中的后缀文本）。
export const MARKDOWN_TEMPLATE_STATUS_SUFFIX: Record<
  Exclude<MarkdownTemplateStatus, "todo">,
  string
> = {
  done: " done",
  in_progress: " in_progress",
}

export const parseMarkdownSuppleEndLine = (lineText: string): ParsedMarkdownSuppleEnd | null => {
  const match = lineText.match(
    /^(\s*)\+\+\+\s+(suppleTemplate|supple)\s+--end(?:\s+\{id:([0-9a-f]{32})\})?(?:\s+\{wt:([^}\s{]+)\})?\s*$/,
  )
  if (!match) return null

  return {
    indent: match[1],
    command: match[2] as "suppleTemplate" | "supple",
    id: match[3],
    wt: match[4],
  }
}

// 读取 supple 补充块结束行的工作区绑定分支；非结束行或无绑定返回 null。
export const getMarkdownSuppleWorktree = (lineText: string): string | null => {
  return parseMarkdownSuppleEndLine(lineText)?.wt ?? null
}

// 更新 supple 补充块结束行的工作区绑定：branch 为 null 时移除绑定，否则写入 {wt:branch}。
export const setMarkdownSuppleWorktree = (lineText: string, branch: string | null): string => {
  const parsed = parseMarkdownSuppleEndLine(lineText)
  if (!parsed) return lineText

  const idPart = parsed.id ? ` {id:${parsed.id}}` : ""
  const wt = branch?.trim() ?? ""
  const wtPart = wt ? ` {wt:${wt}}` : ""
  return `${parsed.indent}+++ ${parsed.command} --end${idPart}${wtPart}`
}

// log 补充块结束行：+++ logTemplate --end 或 +++ log --end。

/**
 * 更新模板块开始行的「title: 」字段：已有则替换内容，缺失则在行尾补插。
 * 标题内不允许出现「」字符，否则会截断「title:...」字段解析。
 */
export const setMarkdownTemplateTitle = (startText: string, title: string): string => {
  const safeTitle = title.replace(/[「」]/g, "").trim()
  const replacement = `「title: ${safeTitle}」`
  return /「title:[^」\n]*」/.test(startText)
    ? startText.replace(/「title:[^」\n]*」/, replacement)
    : `${startText.trimEnd()} ${replacement}`
}

/**
 * 解析模板块结束行的源码状态；非结束行返回 null。
 */
export const getMarkdownTemplateStatus = (lineText: string): MarkdownTemplateStatus | null => {
  const parsed = parseMarkdownTemplateEndLine(lineText)
  if (!parsed) return null

  return parsed.status ?? "todo"
}

/**
 * 循环切换模板块结束行状态（未完成 -> 进行中 -> 已完成 -> 未完成）；非结束行返回 null。
 * 保留 command、--end、id 与 wt（工作区绑定）标记不变。
 */
export const cycleMarkdownTemplateStatus = (lineText: string): string | null => {
  const parsed = parseMarkdownTemplateEndLine(lineText)
  if (!parsed) return null

  const commandPart = parsed.command ? ` ${parsed.command}` : ""
  const endFlagPart = parsed.endFlag ? ` ${parsed.endFlag}` : ""
  const current = parsed.status ?? "todo"
  const next: MarkdownTemplateStatus =
    current === "todo" ? "in_progress" : current === "in_progress" ? "done" : "todo"
  const idPart = parsed.id ? ` {id:${parsed.id}}` : ""
  const wtPart = parsed.wt ? ` {wt:${parsed.wt}}` : ""

  return `${parsed.indent}${parsed.marker}${commandPart}${endFlagPart}${MARKDOWN_TEMPLATE_STATUS_SUFFIX[next] ?? ""}${idPart}${wtPart}`
}

/**
 * 读取模板块结束行的工作区绑定分支；非结束行或无绑定返回 null。
 */
export const getMarkdownTemplateWorktree = (lineText: string): string | null => {
  if (!MARKDOWN_TEMPLATE_END_RE.test(lineText)) return null
  return lineText.match(MARKDOWN_TEMPLATE_WT_RE)?.[1] ?? null
}

/**
 * 更新模板块结束行的工作区绑定：branch 为 null 时移除绑定，否则写入 {wt:branch}。
 * 保留缩进、&&&、command、--end、状态标记与 id；非结束行返回原文本。
 */
export const setMarkdownTemplateWorktree = (lineText: string, branch: string | null): string => {
  const parsed = parseMarkdownTemplateEndLine(lineText)
  if (!parsed) return lineText

  const commandPart = parsed.command ? ` ${parsed.command}` : ""
  const endFlagPart = parsed.endFlag ? ` ${parsed.endFlag}` : ""
  const statusPart = parsed.status ? (MARKDOWN_TEMPLATE_STATUS_SUFFIX[parsed.status] ?? "") : ""
  const idPart = parsed.id ? ` {id:${parsed.id}}` : ""
  const wt = branch?.trim() ?? ""
  const wtPart = wt ? ` {wt:${wt}}` : ""
  return `${parsed.indent}${parsed.marker}${commandPart}${endFlagPart}${statusPart}${idPart}${wtPart}`
}

/**
 * 生成模板块 id：uuid 去除连字符后的 32 位小写十六进制，源码格式 {id:xxxxxxxx...}。
 */
export const createMarkdownTemplateId = (): string => crypto.randomUUID().replaceAll("-", "")

/**
 * 扫描文本中全部模板块及补充块结束行上的 id 源码范围，供编辑器只读保护使用。
 */
export const getMarkdownTemplateIdRanges = (text: string): { from: number; to: number }[] => {
  const ranges: { from: number; to: number }[] = []
  let offset = 0

  for (const line of text.split("\n")) {
    if (MARKDOWN_TEMPLATE_END_RE.test(line) || MARKDOWN_SUPPLE_END_RE.test(line)) {
      const idMatch = line.match(MARKDOWN_TEMPLATE_ID_RE)
      if (idMatch?.index !== undefined) {
        ranges.push({
          from: offset + idMatch.index,
          to: offset + idMatch.index + idMatch[0].length,
        })
      }
    }
    offset += line.length + 1
  }

  return ranges
}

/**
 * 扫描文本中全部模板块及补充块结束行上的 wt（工作区绑定）源码范围，供编辑器只读保护使用。
 */
export const getMarkdownTemplateWtRanges = (text: string): { from: number; to: number }[] => {
  const ranges: { from: number; to: number }[] = []
  let offset = 0

  for (const line of text.split("\n")) {
    if (MARKDOWN_TEMPLATE_END_RE.test(line) || MARKDOWN_SUPPLE_END_RE.test(line)) {
      const wtMatch = line.match(MARKDOWN_TEMPLATE_WT_RE)
      if (wtMatch?.index !== undefined) {
        ranges.push({
          from: offset + wtMatch.index,
          to: offset + wtMatch.index + wtMatch[0].length,
        })
      }
    }
    offset += line.length + 1
  }

  return ranges
}

/**
 * 扫描内容中全部模板块的结束状态；未闭合模板块不计入。
 */
export const getMarkdownTemplateStatuses = (content: string): MarkdownTemplateStatus[] => {
  const statuses: MarkdownTemplateStatus[] = []
  let isOpen = false

  for (const line of content.split("\n")) {
    if (MARKDOWN_TEMPLATE_END_RE.test(line)) {
      const status = getMarkdownTemplateStatus(line)
      if (isOpen) statuses.push(status ?? "todo")
      isOpen = false
    } else if (MARKDOWN_TEMPLATE_START_RE.test(line)) {
      isOpen = true
    }
  }

  return statuses
}

// 模板块状态英文文案。
export const MARKDOWN_TEMPLATE_STATUS_LABELS: Record<MarkdownTemplateStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
}
