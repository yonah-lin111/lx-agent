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

// 压缩单条工具输出文本；过短/过长/无特征/无收益时原样返回。
export const compressToolOutputText = (text: string): string => {
  if (text.length < MIN_COMPRESS_SIZE || text.length > RAW_CAP) return text

  const filterName = detectFilter(text)
  if (!filterName) return text

  const compressed = safeApplyFilter(filterName, text)
  return hasCompressionGain(text, compressed) ? compressed : text
}

// 全部过滤器名称（供测试与调试遍历）。
export const ALL_RTK_FILTER_NAMES = Object.values(RTK_FILTER_NAMES)
