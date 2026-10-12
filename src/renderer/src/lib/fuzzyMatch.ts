/**
 * 子序列模糊匹配：query 按顺序全部出现在 keyword 中即命中（大小写由调用方预处理）。
 */
export const isFuzzyMatch = (query: string, keyword: string): boolean => {
  if (!query) return true
  let queryIndex = 0
  for (const character of keyword) {
    if (character === query[queryIndex]) queryIndex += 1
    if (queryIndex === query.length) return true
  }
  return false
}
