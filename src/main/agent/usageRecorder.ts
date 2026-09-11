import type { Usage } from "@shared/contracts/agent"
import type {
  ModelPricing,
  UsageLogStatus,
  UsagePurpose,
  UsageTokens,
} from "@shared/contracts/usage"
import type { LanguageModelUsage } from "ai"
import { agentSessionService } from "@/services/agentSessionService"
import { getModelProviderSettings } from "@/services/settingsService"
import { usageLogService } from "@/services/usageLogService"

// 日志写入后的广播回调（由 IPC 注册层注入）。
let logRecordedListener: (() => void) | null = null

// 注入/清除日志写入广播回调。
export const setUsageLogRecordedListener = (listener: (() => void) | null): void => {
  logRecordedListener = listener
}

// AI SDK usage 转契约 Usage；旧持久化消息缺 cacheWrite 时按 0 兼容。
export const toUsage = (usage?: LanguageModelUsage | null): Usage => ({
  input: usage?.inputTokens ?? 0,
  output: usage?.outputTokens ?? 0,
  cacheRead: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
  cacheWrite: usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
  totalTokens: usage?.totalTokens ?? 0,
})

/**
 * 依据模型配置解析单价：优先按 model.id 匹配，其次按配置键匹配。
 * 未配置返回 null（成本显示 --，token 统计不受影响）。
 */
export const resolveModelPricing = (providerId: string, modelId: string): ModelPricing | null => {
  const provider = getModelProviderSettings().providers[providerId]
  if (!provider) return null

  for (const model of Object.values(provider.models)) {
    if (model.id === modelId) return model.pricing ?? null
  }

  return provider.models[modelId]?.pricing ?? null
}

// 依据会话解析项目归属（会话可被切换到其他项目，逐次查询保证准确）。
export const resolveProjectId = (sessionId?: string | null): string | null => {
  if (!sessionId) return null
  return agentSessionService.getSession(sessionId)?.project_id ?? null
}

export interface RecordModelCallInput {
  sessionId?: string | null
  purpose: UsagePurpose
  provider: string
  model: string
  tokens: UsageTokens
  durationMs?: number | null
  status?: UsageLogStatus
  errorMessage?: string | null
  pricing?: ModelPricing | null
}

/**
 * 记录一次模型调用并广播事件；任何写入失败都不允许打断模型主流程。
 */
export const recordModelCall = (input: RecordModelCallInput): void => {
  try {
    const pricing =
      input.pricing !== undefined ? input.pricing : resolveModelPricing(input.provider, input.model)

    usageLogService.record(
      {
        sessionId: input.sessionId ?? null,
        projectId: resolveProjectId(input.sessionId),
        purpose: input.purpose,
        provider: input.provider,
        model: input.model,
        tokens: input.tokens,
        durationMs: input.durationMs ?? null,
        status: input.status ?? "success",
        errorMessage: input.errorMessage ?? null,
      },
      pricing,
    )

    logRecordedListener?.()
  } catch (error) {
    console.error("[usage] Failed to record model usage", error)
  }
}
