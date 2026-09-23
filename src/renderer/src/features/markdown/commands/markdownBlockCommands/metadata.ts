import type { CustomCommandBlockType } from "@shared/contracts/customCommand"
import {
  MARKDOWN_LOG_END_RE,
  MARKDOWN_SUPPLE_END_RE,
  MARKDOWN_TEMPLATE_END_RE,
  MARKDOWN_TEMPLATE_ID_RE,
  MARKDOWN_TEMPLATE_START_RE,
  MARKDOWN_TEMPLATE_WT_RE,
  MARKDOWN_VAR_TEMPLATE_END_RE,
  MARKDOWN_VAR_TEMPLATE_START_RE,
  type ParsedMarkdownSubblockStart,
  parseMarkdownLogEndLine,
  parseMarkdownLogStartLine,
  parseMarkdownSuppleStartLine,
  parseMarkdownTemplateEndLine,
  parseMarkdownTemplateStartLine,
  parseMarkdownVarTemplateEndLine,
} from "./markers"
import type {
  MarkdownTemplateStatus,
  NormalizedAgentBlockBody,
  ParsedMarkdownSuppleEnd,
} from "./types"

// 模板块状态标记（源码中的后缀文本）。
export const MARKDOWN_TEMPLATE_STATUS_SUFFIX: Record<
  Exclude<MarkdownTemplateStatus, "todo">,
  string
> = {
  done: " done",
  in_progress: " in_progress",
}

export const parseMarkdownSuppleEndLine = (lineText: string): ParsedMarkdownSuppleEnd | null => {
  if (!MARKDOWN_SUPPLE_END_RE.test(lineText)) return null

  const match = lineText.match(
    /^(\s*)\+\+\+\s+([A-Za-z]\w*)\s+--end(?:\s+\{id:([0-9a-f]{32})\})?(?:\s+\{wt:([^}\s{]+)\})?\s*$/,
  )
  if (!match) return null

  return {
    indent: match[1],
    command: match[2],
    id: match[3],
    wt: match[4],
  }
}

// 读取临时块结束行的工作区绑定分支；非结束行或无绑定返回 null。
export const getMarkdownSuppleWorktree = (lineText: string): string | null => {
  return parseMarkdownSuppleEndLine(lineText)?.wt ?? null
}

// 更新临时块结束行的工作区绑定：branch 为 null 时移除绑定，否则写入 {wt:branch}。
export const setMarkdownSuppleWorktree = (lineText: string, branch: string | null): string => {
  const parsed = parseMarkdownSuppleEndLine(lineText)
  if (!parsed) return lineText

  const idPart = parsed.id ? ` {id:${parsed.id}}` : ""
  const wt = branch?.trim() ?? ""
  const wtPart = wt ? ` {wt:${wt}}` : ""
  return `${parsed.indent}+++ ${parsed.command} --end${idPart}${wtPart}`
}

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
 * 为自定义模板内容补全块 id（插入时调用）：
 * - `&&& <command> --end` 结束行注入 `{id:...}`，多个模板块各自独立；
 * - `+++ <name> --end` 临时块结束行注入 `{id:...}`；
 * - `%%% <name> --end` 记录块结束行注入 `{id:...}`（兼容旧版 +++ log/logTemplate）；
 * - `$$$ [varTemplate --end | --end]` 变量模板块结束行注入 `{id:...}`；
 * 已有 id 的结束行保持不变，id 始终写在 `{wt:...}` 之前；开始行与正文行不受影响。
 */
export const injectCustomTemplateBlockIds = (content: string): string => {
  // $$$ 变量模板块的裸 $$$ 行开闭同形，需按配对状态区分开始行与结束行。
  let isInsideVarBlock = false

  return content
    .split("\n")
    .map((line) => {
      if (!isInsideVarBlock && MARKDOWN_VAR_TEMPLATE_START_RE.test(line)) {
        isInsideVarBlock = true
        return line
      }

      const templateEnd = parseMarkdownTemplateEndLine(line)
      if (templateEnd) {
        if (templateEnd.id) return line
        const commandPart = templateEnd.command ? ` ${templateEnd.command}` : ""
        const endFlagPart = templateEnd.endFlag ? ` ${templateEnd.endFlag}` : ""
        const statusPart = templateEnd.status
          ? (MARKDOWN_TEMPLATE_STATUS_SUFFIX[templateEnd.status] ?? "")
          : ""
        const wtPart = templateEnd.wt ? ` {wt:${templateEnd.wt}}` : ""
        return `${templateEnd.indent}${templateEnd.marker}${commandPart}${endFlagPart}${statusPart} {id:${createMarkdownTemplateId()}}${wtPart}`
      }

      const suppleEnd = parseMarkdownSuppleEndLine(line)
      if (suppleEnd) {
        if (suppleEnd.id) return line
        const wtPart = suppleEnd.wt ? ` {wt:${suppleEnd.wt}}` : ""
        return `${suppleEnd.indent}+++ ${suppleEnd.command} --end {id:${createMarkdownTemplateId()}}${wtPart}`
      }

      const logEnd = parseMarkdownLogEndLine(line)
      if (logEnd) {
        if (logEnd.id) return line
        return `${logEnd.indent}${logEnd.marker} ${logEnd.command} --end {id:${createMarkdownTemplateId()}}`
      }

      // 变量模板块结束行：显式 --end 形式无需配对状态；裸 $$$ 行开闭同形，需处于配对状态。
      const varEnd = parseMarkdownVarTemplateEndLine(line)
      const isVarEndLine = varEnd !== null && (Boolean(varEnd.endFlag) || isInsideVarBlock)
      if (!varEnd || !isVarEndLine) return line

      isInsideVarBlock = false
      if (varEnd.id) return line
      const commandPart = varEnd.command ? ` ${varEnd.command}` : ""
      const endFlagPart = varEnd.endFlag ? ` ${varEnd.endFlag}` : ""
      // 模板字符串中 "$$${" 会被解析为插值，故拼接字面量。
      return (
        varEnd.indent + "$$$" + commandPart + endFlagPart + ` {id:${createMarkdownTemplateId()}}`
      )
    })
    .join("\n")
}

// 按块类型解析开始行。
const parseAgentBlockStartLine = (
  line: string,
  blockType: CustomCommandBlockType,
): ParsedMarkdownSubblockStart | null =>
  blockType === "supple"
    ? parseMarkdownSuppleStartLine(line)
    : blockType === "log"
      ? parseMarkdownLogStartLine(line)
      : parseMarkdownTemplateStartLine(line)

// 按块类型判断结束行。
const isAgentBlockEndLine = (line: string, blockType: CustomCommandBlockType): boolean =>
  blockType === "supple"
    ? MARKDOWN_SUPPLE_END_RE.test(line)
    : blockType === "log"
      ? MARKDOWN_LOG_END_RE.test(line)
      : parseMarkdownTemplateEndLine(line) !== null

/**
 * 规范化模板块（agentBlock）正文：用户在设置页常直接粘贴编辑器中的完整块源码，
 * 此时剥离最外层块起止行（仅限同一块类型），并提取开始行「title: 标题」作为标题兜底。
 * 正文首行缩进保留，首尾空行移除。
 */
export const normalizeAgentBlockBody = (
  body: string,
  blockType: CustomCommandBlockType,
): NormalizedAgentBlockBody => {
  const lines = body.split("\n")
  let start = 0
  let end = lines.length - 1
  while (start <= end && lines[start].trim() === "") start += 1
  while (end >= start && lines[end].trim() === "") end -= 1
  if (start > end) return { content: "" }

  const content = lines.slice(start, end + 1)
  if (content.length < 2) return { content: content.join("\n").trimEnd() }

  const parsedStart = parseAgentBlockStartLine(content[0], blockType)
  if (!parsedStart) return { content: content.join("\n").trimEnd() }
  if (!isAgentBlockEndLine(content[content.length - 1], blockType)) {
    return { content: content.join("\n").trimEnd() }
  }

  const inner = content.slice(1, -1)
  while (inner.length > 0 && inner[0].trim() === "") inner.shift()
  while (inner.length > 0 && inner[inner.length - 1].trim() === "") inner.pop()

  const title = parsedStart.title?.trim()
  return { content: inner.join("\n"), title: title || undefined }
}

// 模板块名称统一后缀（与骨架占位名 xxxTemplate 一致）。
export const MARKDOWN_BLOCK_NAME_SUFFIX = "Template"

// 追加模板块名称后缀（已含后缀或为空时不重复追加）。
export const withMarkdownBlockNameSuffix = (value: string): string =>
  value === "" || value.endsWith(MARKDOWN_BLOCK_NAME_SUFFIX)
    ? value
    : `${value}${MARKDOWN_BLOCK_NAME_SUFFIX}`

// 剥离模板块名称后缀，供输入框展示。
export const stripMarkdownBlockNameSuffix = (name: string): string =>
  name.endsWith(MARKDOWN_BLOCK_NAME_SUFFIX)
    ? name.slice(0, -MARKDOWN_BLOCK_NAME_SUFFIX.length)
    : name

/**
 * 构建模板块完整源码（设置页预览与插入共用）：起止行由表单驱动，
 * 开始行始终携带「title: 」占位（空标题时留位便于填充），结束行不带 id（插入文档时统一注入）。
 */
export const buildAgentBlockSource = (input: {
  name: string
  title: string
  blockType: CustomCommandBlockType
  content: string
}): string => {
  const marker = input.blockType === "supple" ? "+++" : input.blockType === "log" ? "%%%" : "&&&"
  return `${marker} ${input.name} --start 「title: ${input.title.trim()}」\n${input.content}\n${marker} ${input.name} --end`
}

/**
 * 从模板块完整源码提取正文（无损：仅剥离首末起止行，保留正文内空行）；
 * 首行非对应块类型开始行或末行非结束行时返回 null。
 */
export const extractAgentBlockBody = (
  text: string,
  blockType: CustomCommandBlockType,
): string | null => {
  const lines = text.split("\n")
  if (lines.length < 2) return null
  if (!parseAgentBlockStartLine(lines[0], blockType)) return null
  if (!isAgentBlockEndLine(lines[lines.length - 1], blockType)) return null

  return lines.slice(1, -1).join("\n")
}

/**
 * 扫描文本中全部任务块、临时块、记录块与变量模板块结束行上的 id 源码范围，供编辑器只读保护使用。
 */
export const getMarkdownTemplateIdRanges = (text: string): { from: number; to: number }[] => {
  const ranges: { from: number; to: number }[] = []
  let offset = 0

  for (const line of text.split("\n")) {
    if (
      MARKDOWN_TEMPLATE_END_RE.test(line) ||
      MARKDOWN_SUPPLE_END_RE.test(line) ||
      MARKDOWN_LOG_END_RE.test(line) ||
      MARKDOWN_VAR_TEMPLATE_END_RE.test(line)
    ) {
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
 * 扫描文本中全部任务块与临时块结束行上的 wt（工作区绑定）源码范围，供编辑器只读保护使用。
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
