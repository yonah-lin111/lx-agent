// Token Saver 出站转换入口：压缩工具结果并叠加风格提示词；任何异常原样放行（fail-open）。

import type { TokenSaverRun } from "@shared/contracts/agent"
import type { TokenSaverSettings } from "@shared/settings"
import type { LlmMessage } from "@/agent/core/types"
import { buildTokenSaverPromptSuffix } from "./prompts"
import {
  compressToolResultMessages,
  createRtkCompressionStats,
  type RtkCompressionStats,
} from "./rtk/compress"

// 出站请求载荷。
export interface TokenSaverRequest {
  systemPrompt: string
  messages: LlmMessage[]
}

// Token Saver 转换结果：run 为本次实际生效记录（完全未生效时不设置）。
export interface TokenSaverTransformResult extends TokenSaverRequest {
  run?: TokenSaverRun
}

// 依据压缩统计与开关状态汇总生效记录。
const buildRunRecord = (
  settings: TokenSaverSettings,
  stats: RtkCompressionStats,
): TokenSaverRun | undefined => {
  const run: TokenSaverRun = {}
  if (stats.filters.size > 0) {
    run.rtkFilters = [...stats.filters]
    run.rtkSavedChars = stats.savedChars
    run.hits = stats.hits
  }
  if (settings.cavemanEnabled) run.cavemanLevel = settings.cavemanLevel
  if (settings.ponytailEnabled) run.ponytailLevel = settings.ponytailLevel
  return Object.keys(run).length > 0 ? run : undefined
}

// 应用 Token Saver 转换；未开启或异常时返回入参引用。
export const applyTokenSaver = (
  request: TokenSaverRequest,
  settings: TokenSaverSettings,
): TokenSaverTransformResult => {
  try {
    const stats = createRtkCompressionStats()
    const messages = settings.rtkEnabled
      ? compressToolResultMessages(request.messages, stats)
      : request.messages
    const suffix = buildTokenSaverPromptSuffix(settings)
    const systemPrompt = suffix
      ? request.systemPrompt
        ? `${request.systemPrompt}\n\n${suffix}`
        : suffix
      : request.systemPrompt
    const run = buildRunRecord(settings, stats)

    if (messages === request.messages && systemPrompt === request.systemPrompt) {
      return run ? { ...request, run } : request
    }
    return { systemPrompt, messages, ...(run ? { run } : {}) }
  } catch (error) {
    console.warn("[TokenSaver] outbound transform failed, passing through raw request:", error)
    return request
  }
}
