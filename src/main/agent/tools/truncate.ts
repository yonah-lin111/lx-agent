// 工具输出共享截断工具。
// 截断基于两个独立限制，先命中的生效：行数上限（默认 2000）与字节上限（默认 50KB）。
// 不返回部分行（除 bash 尾部截断的边界情况）。

export const DEFAULT_MAX_LINES = 2000
export const DEFAULT_MAX_BYTES = 50 * 1024 // 50KB
export const GREP_MAX_LINE_LENGTH = 500 // grep 匹配单行最大字符数

export interface TruncationResult {
  /** 截断后的内容 */
  content: string
  /** 是否发生了截断 */
  truncated: boolean
  /** 命中的限制："lines" | "bytes"，未截断为 null */
  truncatedBy: "lines" | "bytes" | null
  /** 原始内容总行数 */
  totalLines: number
  /** 原始内容总字节数 */
  totalBytes: number
  /** 截断输出中的完整行数 */
  outputLines: number
  /** 截断输出的字节数 */
  outputBytes: number
  /** 末行是否被部分截断（仅尾部截断边界情况） */
  lastLinePartial: boolean
  /** 首行是否超过字节上限（头部截断用） */
  firstLineExceedsLimit: boolean
  /** 应用的行数上限 */
  maxLines: number
  /** 应用的字节上限 */
  maxBytes: number
}

export interface TruncationOptions {
  /** 最大行数（默认 2000） */
  maxLines?: number
  /** 最大字节数（默认 50KB） */
  maxBytes?: number
}

const splitLinesForCounting = (content: string): string[] => {
  if (content.length === 0) {
    return []
  }
  const lines = content.split("\n")
  if (content.endsWith("\n")) {
    lines.pop()
  }
  return lines
}

// 将字节数格式化为人类可读大小。
export const formatSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes}B`
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }
}

// 从头部截断（保留前 N 行/字节），适用于文件读取等需要看到开头的场景。
// 不返回部分行；若首行即超字节上限，返回空内容并置 firstLineExceedsLimit。
export const truncateHead = (
  content: string,
  options: TruncationOptions = {},
): TruncationResult => {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  const totalBytes = Buffer.byteLength(content, "utf-8")
  const lines = splitLinesForCounting(content)
  const totalLines = lines.length

  // 无需截断
  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines,
      maxBytes,
    }
  }

  // 首行单独即超字节上限
  const firstLineBytes = Buffer.byteLength(lines[0], "utf-8")
  if (firstLineBytes > maxBytes) {
    return {
      content: "",
      truncated: true,
      truncatedBy: "bytes",
      totalLines,
      totalBytes,
      outputLines: 0,
      outputBytes: 0,
      lastLinePartial: false,
      firstLineExceedsLimit: true,
      maxLines,
      maxBytes,
    }
  }

  // 收集能放下的完整行
  const outputLinesArr: string[] = []
  let outputBytesCount = 0
  let truncatedBy: "lines" | "bytes" = "lines"

  for (let i = 0; i < lines.length && i < maxLines; i++) {
    const line = lines[i]
    const lineBytes = Buffer.byteLength(line, "utf-8") + (i > 0 ? 1 : 0) // +1 换行符

    if (outputBytesCount + lineBytes > maxBytes) {
      truncatedBy = "bytes"
      break
    }

    outputLinesArr.push(line)
    outputBytesCount += lineBytes
  }

  // 因行数上限退出
  if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
    truncatedBy = "lines"
  }

  const outputContent = outputLinesArr.join("\n")
  const finalOutputBytes = Buffer.byteLength(outputContent, "utf-8")

  return {
    content: outputContent,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines: outputLinesArr.length,
    outputBytes: finalOutputBytes,
    lastLinePartial: false,
    firstLineExceedsLimit: false,
    maxLines,
    maxBytes,
  }
}

// 从尾部截断（保留后 N 行/字节），适用于 bash 输出等需要看到结尾（错误、最终结果）的场景。
// 若原始末行超过字节上限，可能返回部分首行。
export const truncateTail = (
  content: string,
  options: TruncationOptions = {},
): TruncationResult => {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  const totalBytes = Buffer.byteLength(content, "utf-8")
  const lines = splitLinesForCounting(content)
  const totalLines = lines.length

  // 无需截断
  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines,
      maxBytes,
    }
  }

  // 从末尾倒序收集
  const outputLinesArr: string[] = []
  let outputBytesCount = 0
  let truncatedBy: "lines" | "bytes" = "lines"
  let lastLinePartial = false

  for (let i = lines.length - 1; i >= 0 && outputLinesArr.length < maxLines; i--) {
    const line = lines[i]
    const lineBytes = Buffer.byteLength(line, "utf-8") + (outputLinesArr.length > 0 ? 1 : 0) // +1 换行符

    if (outputBytesCount + lineBytes > maxBytes) {
      truncatedBy = "bytes"
      // 边界情况：尚未加入任何行且此行超限，取该行末尾（部分）
      if (outputLinesArr.length === 0) {
        const truncatedLine = truncateStringToBytesFromEnd(line, maxBytes)
        outputLinesArr.unshift(truncatedLine)
        outputBytesCount = Buffer.byteLength(truncatedLine, "utf-8")
        lastLinePartial = true
      }
      break
    }

    outputLinesArr.unshift(line)
    outputBytesCount += lineBytes
  }

  // 因行数上限退出
  if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
    truncatedBy = "lines"
  }

  const outputContent = outputLinesArr.join("\n")
  const finalOutputBytes = Buffer.byteLength(outputContent, "utf-8")

  return {
    content: outputContent,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines: outputLinesArr.length,
    outputBytes: finalOutputBytes,
    lastLinePartial,
    firstLineExceedsLimit: false,
    maxLines,
    maxBytes,
  }
}

// 将字符串从末尾截断到字节上限内，正确处理多字节 UTF-8 字符。
const truncateStringToBytesFromEnd = (str: string, maxBytes: number): string => {
  const buf = Buffer.from(str, "utf-8")
  if (buf.length <= maxBytes) {
    return str
  }

  // 从末尾向前回退 maxBytes 字节
  let start = buf.length - maxBytes

  // 对齐到合法的 UTF-8 字符边界
  while (start < buf.length && (buf[start] & 0xc0) === 0x80) {
    start++
  }

  return buf.slice(start).toString("utf-8")
}

// 将单行截断到最大字符数，并追加 [truncated] 后缀（用于 grep 匹配行）。
export const truncateLine = (
  line: string,
  maxChars: number = GREP_MAX_LINE_LENGTH,
): { text: string; wasTruncated: boolean } => {
  if (line.length <= maxChars) {
    return { text: line, wasTruncated: false }
  }
  return { text: `${line.slice(0, maxChars)}... [truncated]`, wasTruncated: true }
}
