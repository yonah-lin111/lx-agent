// 移植自 9router open-sse/rtk/applyFilter.js：过滤器异常安全执行。

import { detectFilter } from "./autodetect"
import { MIN_COMPRESS_SIZE, RAW_CAP, RTK_FILTER_NAMES, type RtkFilterName } from "./constants"
import { RTK_FILTERS } from "./registry"

// 执行过滤器；任何异常回退原始文本（参考实现 catch_unwind 语义）。
export const safeApplyFilter = (name: RtkFilterName, input: string): string => {
  try {
    const out = RTK_FILTERS[name](input)
    return typeof out === "string" ? out : input
  } catch (error) {
    console.warn(`[TokenSaver] filter '${name}' failed, passing through raw output:`, error)
    return input
  }
}

// 需要更短才有收益的下限：压缩失败或增长时保留原文。
export const hasCompressionGain = (original: string, compressed: string): boolean =>
  compressed.length > 0 && compressed.length < original.length

// RTK 压缩统计累加器（随出站请求汇总，供消息落库与执行流程展示）。
export interface RtkCompressionStats {
  // 实际生效的过滤器名（去重，按首次生效顺序）。
  filters: Set<RtkFilterName>
  // 压缩节省的字符数。
  savedChars: number
}

// 压缩单条工具输出文本；过短/过长/无特征/无收益时原样返回。
export const compressToolOutputText = (text: string, stats?: RtkCompressionStats): string => {
  if (text.length < MIN_COMPRESS_SIZE || text.length > RAW_CAP) return text

  const filterName = detectFilter(text)
  if (!filterName) return text

  const compressed = safeApplyFilter(filterName, text)
  if (!hasCompressionGain(text, compressed)) return text

  if (stats) {
    stats.filters.add(filterName)
    stats.savedChars += text.length - compressed.length
  }
  return compressed
}

// 全部过滤器名称（供测试与调试遍历）。
export const ALL_RTK_FILTER_NAMES = Object.values(RTK_FILTER_NAMES)
