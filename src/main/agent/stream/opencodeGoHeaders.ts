import type { ModelProvider } from "@shared/settings"
import { app } from "electron"

// opencode Go 端点要求的会话路由头；缺失时请求会被拒绝。
export const OPENCODE_GO_SESSION_HEADER = "x-opencode-session"

// 无会话上下文的辅助链路使用的稳定合成会话 ID。
export const OPENCODE_GO_AUXILIARY_SESSION_IDS = {
  templateTitle: "lx-agent:template-title",
  suggestedQuestions: "lx-agent:suggested-questions",
  auxiliary: "lx-agent:auxiliary",
} as const

const OPENCODE_GO_HOST = "opencode.ai"
const OPENCODE_GO_PATH_PREFIX = "/zen/go"
const FALLBACK_USER_AGENT = "lx-agent/0.0.0"

/**
 * 判断 baseURL 是否指向 opencode Go 端点（严格匹配 opencode.ai 主机与 /zen/go 路径段）。
 */
export const isOpencodeGoEndpoint = (baseURL: string): boolean => {
  let url: URL
  try {
    url = new URL(baseURL)
  } catch {
    return false
  }
  if (url.hostname !== OPENCODE_GO_HOST) return false
  return (
    url.pathname === OPENCODE_GO_PATH_PREFIX ||
    url.pathname.startsWith(`${OPENCODE_GO_PATH_PREFIX}/`)
  )
}

/**
 * 读取应用版本生成客户端 UA；非 Electron 环境（测试）回退固定值。
 */
const resolveUserAgent = (): string => {
  try {
    const version = app?.getVersion()
    return version ? `lx-agent/${version}` : FALLBACK_USER_AGENT
  } catch {
    return FALLBACK_USER_AGENT
  }
}

/**
 * 构造 opencode Go 的附加请求头；非 opencode Go Provider 返回 undefined。
 * 端点要求客户端以自身 User-Agent 标识，并按会话发送稳定的 x-opencode-session。
 */
export const buildOpencodeGoRequestHeaders = (
  provider: ModelProvider | undefined,
  sessionId: string | null | undefined,
): Record<string, string> | undefined => {
  if (!provider || !isOpencodeGoEndpoint(provider.options.baseURL)) return undefined
  return {
    [OPENCODE_GO_SESSION_HEADER]: sessionId?.trim() || OPENCODE_GO_AUXILIARY_SESSION_IDS.auxiliary,
    "user-agent": resolveUserAgent(),
  }
}
