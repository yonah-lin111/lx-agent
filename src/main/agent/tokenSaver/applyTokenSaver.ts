// Token Saver 出站转换入口：压缩工具结果并叠加风格提示词；任何异常原样放行（fail-open）。

import type { TokenSaverSettings } from "@shared/settings"
import type { LlmMessage } from "@/agent/core/types"
import { buildTokenSaverPromptSuffix } from "./prompts"
import { compressToolResultMessages } from "./rtk/compress"

// 出站请求载荷。
export interface TokenSaverRequest {
  systemPrompt: string
  messages: LlmMessage[]
}

// 应用 Token Saver 转换；未开启或异常时返回入参引用。
export const applyTokenSaver = (
  request: TokenSaverRequest,
  settings: TokenSaverSettings,
): TokenSaverRequest => {
  try {
    const messages = settings.rtkEnabled
      ? compressToolResultMessages(request.messages)
      : request.messages
    const suffix = buildTokenSaverPromptSuffix(settings)
    const systemPrompt = suffix
      ? request.systemPrompt
        ? `${request.systemPrompt}\n\n${suffix}`
        : suffix
      : request.systemPrompt

    if (messages === request.messages && systemPrompt === request.systemPrompt) return request
    return { systemPrompt, messages }
  } catch (error) {
    console.warn("[TokenSaver] outbound transform failed, passing through raw request:", error)
    return request
  }
}
