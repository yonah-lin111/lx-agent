import type { MarkdownTemplateStatus } from "./types"

// 模板块开始行：&&& command [--start] [「title: 标题」]；done/in_progress/supple/suppleTemplate/log/logTemplate 为状态/子块保留词，{id:/{wt: 为结束行元数据。
export const MARKDOWN_TEMPLATE_START_RE =
  /^\s*&&&\s+(?!done\b|in_progress\b|supple\b|suppleTemplate\b|log\b|logTemplate\b|\{id:|\{wt:)(?:[A-Za-z]\w*)(?:\s+--start)?(?:\s+「title:[^」\n]*」)?\s*$/

// 模板块 id：uuid 去连字符后的 32 位小写十六进制，源码格式 {id:xxxxxxxx...}。
export const MARKDOWN_TEMPLATE_ID_RE = /\{id:([0-9a-f]{32})\}/

// 模板块 git 工作区绑定分支：源码格式 {wt:分支名}，分支名不含空白、} 或 {。
export const MARKDOWN_TEMPLATE_WT_RE = /\{wt:([^}\s{]+)\}/

// 模板块结束行：&&& [command --end] [状态标记] [{id:...}] [{wt:...}] 或旧格式 &&& [状态标记] [{id:...}] [{wt:...}]。
// 注意：如果带有 command，必须同时带有 --end 标记（例如 &&& addTemplate --end），避免将开始行（如 &&& addTemplate）误判为结束行！
export const MARKDOWN_TEMPLATE_END_RE =
  /^\s*&&&(?:\s+(?:[A-Za-z]\w*)\s+--end|\s+--end)?(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/

export interface ParsedMarkdownTemplateEnd {
  indent: string
  marker: string
  command?: string
  endFlag?: string
  status?: MarkdownTemplateStatus
  id?: string
  wt?: string
}

export const parseMarkdownTemplateEndLine = (
  lineText: string,
): ParsedMarkdownTemplateEnd | null => {
  if (!MARKDOWN_TEMPLATE_END_RE.test(lineText)) return null

  const match = lineText.match(
    /^(\s*)(&&&)(?:\s+(?!\{id:|\{wt:)(.+?))?(?:\s+\{id:([0-9a-f]{32})\})?(?:\s+\{wt:([^}\s{]+)\})?\s*$/,
  )
  if (!match) return null

  const indent = match[1]
  const marker = match[2]
  const middle = match[3]?.trim() ?? ""
  const id = match[4]
  const wt = match[5]

  let command: string | undefined
  let endFlag: string | undefined
  let status: MarkdownTemplateStatus | undefined

  if (middle) {
    const tokens = middle.split(/\s+/)
    for (const token of tokens) {
      if (token === "done" || token === "in_progress") {
        status = token
      } else if (token === "--end") {
        endFlag = token
      } else if (!command && /^[A-Za-z]\w*$/.test(token)) {
        command = token
      } else {
        return null
      }
    }
  }

  // 如果有 command，必须有 --end
  if (command && !endFlag) return null

  return { indent, marker, command, endFlag, status, id, wt }
}

// 模板块注释行：// 开头（允许前置缩进）。
export const MARKDOWN_TEMPLATE_COMMENT_RE = /^\s*\/\//

// supple 补充块开始行：+++ suppleTemplate --start 或 +++ supple --start。
export const MARKDOWN_SUPPLE_START_RE = /^\s*\+\+\+\s+(?:suppleTemplate|supple)\s+--start\s*$/

// log 补充块开始行：+++ logTemplate --start 或 +++ log --start。
export const MARKDOWN_LOG_START_RE = /^\s*\+\+\+\s+(?:logTemplate|log)\s+--start\s*$/

// supple 补充块结束行：+++ suppleTemplate --end 或 +++ supple --end，可选携带 {id:...} 与 {wt:...}。
export const MARKDOWN_SUPPLE_END_RE =
  /^\s*\+\+\+\s+(?:suppleTemplate|supple)\s+--end(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/

// 变量模板块开始行：$$$ varTemplate [--start] [「title: 标题」]。
export const MARKDOWN_VAR_TEMPLATE_START_RE =
  /^\s*\$\$\$\s+varTemplate(?:\s+--start)?(?:\s+「title:[^」\n]*」)?\s*$/

// 变量模板块结束行：$$$ [varTemplate --end | --end]。
export const MARKDOWN_VAR_TEMPLATE_END_RE = /^\s*\$\$\$(?:\s+(?:varTemplate)\s+--end|\s+--end)?\s*$/

export const MARKDOWN_LOG_END_RE = /^\s*\+\+\+\s+(?:logTemplate|log)\s+--end\s*$/

/**
 * 判断指定文本末尾是否处于未闭合的 log 日志块内。
 */
export const isInsideMarkdownLogBlock = (text: string): boolean => {
  let isOpen = false

  for (const line of text.split("\n")) {
    if (isOpen) {
      if (MARKDOWN_LOG_END_RE.test(line)) {
        isOpen = false
      }
    } else if (MARKDOWN_LOG_START_RE.test(line)) {
      isOpen = true
    }
  }

  return isOpen
}

/**
 * 判断指定文本末尾是否处于未闭合的 supple 补充块内。
 */
export const isInsideMarkdownSuppleBlock = (text: string): boolean => {
  let isOpen = false

  for (const line of text.split("\n")) {
    if (isOpen) {
      if (MARKDOWN_SUPPLE_END_RE.test(line)) {
        isOpen = false
      }
    } else if (MARKDOWN_SUPPLE_START_RE.test(line)) {
      isOpen = true
    }
  }

  return isOpen
}

/**
 * 判断指定文本末尾是否处于未闭合的模板块内。
 */
export const isInsideMarkdownTemplateBlock = (text: string): boolean => {
  let isOpen = false

  for (const line of text.split("\n")) {
    if (MARKDOWN_TEMPLATE_END_RE.test(line)) {
      isOpen = false
    } else if (MARKDOWN_TEMPLATE_START_RE.test(line)) {
      isOpen = true
    }
  }

  return isOpen
}

/**
 * 判断指定文本末尾是否处于未闭合的变量模板块（$$$ varTemplate）内。
 */
export const isInsideMarkdownVarTemplateBlock = (text: string): boolean => {
  let isOpen = false

  for (const line of text.split("\n")) {
    if (MARKDOWN_VAR_TEMPLATE_END_RE.test(line)) {
      isOpen = false
    } else if (MARKDOWN_VAR_TEMPLATE_START_RE.test(line)) {
      isOpen = true
    }
  }

  return isOpen
}

/**
 * 切换文本中每一行的模板块注释状态：所有非空行均为注释时统一解除注释，
 * 否则为所有非空行在原有缩进后添加 //。空行保持原样。
 */
export const toggleMarkdownTemplateCommentLines = (text: string): string => {
  const lines = text.split("\n")
  const contentLines = lines.filter((line) => line.trim() !== "")
  const allCommented =
    contentLines.length > 0 && contentLines.every((line) => MARKDOWN_TEMPLATE_COMMENT_RE.test(line))

  return lines
    .map((line) => {
      if (line.trim() === "") return line
      if (allCommented) {
        return line.replace(/^(\s*)\/\/\s?/, "$1")
      }
      const indentMatch = line.match(/^(\s*)/)
      return `${indentMatch?.[1] ?? ""}// ${line.trimStart()}`
    })
    .join("\n")
}

/**
 * 判断一行是否为模板块开始标记（&&& <command> [「title:...」]）。
 */
export const isMarkdownTemplateStartLine = (line: string): boolean =>
  MARKDOWN_TEMPLATE_START_RE.test(line)

/**
 * 判断一行是否为模板块结束标记（&&& [done|in_progress] [{id:...}] [{wt:...}]）。
 */
export const isMarkdownTemplateEndLine = (line: string): boolean =>
  MARKDOWN_TEMPLATE_END_RE.test(line)

/**
 * 判断一行是否为 supple 补充块开始标记（+++ suppleTemplate --start 或 +++ supple --start）。
 */
export const isMarkdownSuppleStartLine = (line: string): boolean =>
  MARKDOWN_SUPPLE_START_RE.test(line)

/**
 * 判断一行是否为 supple 补充块结束标记（+++ suppleTemplate --end 或 +++ supple --end）。
 */
export const isMarkdownSuppleEndLine = (line: string): boolean => MARKDOWN_SUPPLE_END_RE.test(line)

/**
 * 判断一行是否为 log 补充块开始标记（+++ logTemplate --start 或 +++ log --start）。
 */
export const isMarkdownLogStartLine = (line: string): boolean => MARKDOWN_LOG_START_RE.test(line)

/**
 * 判断一行是否为 log 补充块结束标记（+++ logTemplate --end 或 +++ log --end）。
 */
export const isMarkdownLogEndLine = (line: string): boolean => MARKDOWN_LOG_END_RE.test(line)
