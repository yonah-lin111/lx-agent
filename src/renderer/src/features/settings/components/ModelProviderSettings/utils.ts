import type { ModelProvider } from "@/features/settings/types"

/**
 * 生成未占用的 Provider 标识。
 */
export const createProviderId = (providers: Record<string, ModelProvider>): string => {
  let index = Object.keys(providers).length + 1
  let id = `provider-${index}`
  while (providers[id]) {
    index += 1
    id = `provider-${index}`
  }
  return id
}

/**
 * 将获取模型列表的错误转换为用户可读的中文提示。
 */
export const toFetchModelsErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("HTTP 401") || message.includes("HTTP 403")) {
    return "认证失败，请检查 API Key"
  }
  if (
    message.includes("All candidates failed") ||
    message.includes("HTTP 404") ||
    message.includes("HTTP 405")
  ) {
    return "获取模型失败，请检查 Base URL 是否支持 /models 接口"
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "请求超时"
  }
  if (message.includes("Failed to parse")) {
    return "响应格式不支持"
  }
  return "获取模型失败"
}

/**
 * 模糊匹配：查询串的字符需按顺序出现在目标串中即匹配（忽略大小写）。
 */
export const fuzzyMatches = (target: string, query: string): boolean => {
  let index = 0
  for (const char of query) {
    index = target.indexOf(char, index)
    if (index === -1) return false
    index += 1
  }
  return true
}
