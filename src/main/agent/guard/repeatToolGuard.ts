/**
 * 重复工具调用守卫 (Repeat Tool Guard)
 *
 * 借鉴 deepseek-harness 的 dsh-repeat-tool-reminder 机制：
 * 1. 规范化参数 (深度排序 Key + Canonical JSON)。
 * 2. 统计以完全相同的规范化参数连续调用同一工具的次数。
 * 3. 排除特定对链透明的工具 (如 todowrite, question 等)。
 * 4. 逐级干预策略：
 *    - 达到阈值 3：注入初级提醒 (提示复查上次结果并改换策略)。
 *    - 达到阈值 5：注入详细警示 (列出工具名、连续调用次数、参数预览，严厉警示)。
 *    - 达到上限 7：硬阻断 (拒绝执行该工具并返回错误)。
 */

export interface RepeatToolGuardConfig {
  /** 软性警告阈值，默认 [3, 5] */
  warningThresholds?: number[]
  /** 硬阻断上限阈值，默认 7 */
  blockThreshold?: number
  /** 对链透明的工具列表（不打断连续计数也不递增计数） */
  transparentTools?: string[]
  /** 提醒信息中展示的参数最大字符数，默认 300 */
  argumentsPreviewChars?: number
}

export interface GuardCheckResult {
  blocked: boolean
  blockReason?: string
  reminder?: string
}

export function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue)
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    result[key] = canonicalizeValue((value as Record<string, unknown>)[key])
  }
  return result
}

export function computeToolFingerprint(toolName: string, args: unknown): string {
  const canonical = canonicalizeValue(args)
  return `${toolName}:${JSON.stringify(canonical)}`
}

interface SessionToolChain {
  lastFingerprint?: string
  consecutiveCount: number
}

export class RepeatToolGuard {
  private readonly warningThresholds: number[]
  private readonly blockThreshold: number
  private readonly transparentTools: Set<string>
  private readonly argumentsPreviewChars: number
  private readonly sessionChains = new Map<string, SessionToolChain>()

  constructor(config: RepeatToolGuardConfig = {}) {
    this.warningThresholds = config.warningThresholds ?? [3, 5]
    this.blockThreshold = config.blockThreshold ?? 7
    this.transparentTools = new Set(config.transparentTools ?? ["todowrite", "question", "task"])
    this.argumentsPreviewChars = config.argumentsPreviewChars ?? 300
  }

  resetSession(sessionId: string): void {
    this.sessionChains.delete(sessionId)
  }

  /**
   * 在工具执行前检查调用频率与重复状态
   */
  checkBeforeExecute(sessionId: string, toolName: string, args: unknown): GuardCheckResult {
    if (this.transparentTools.has(toolName)) {
      return { blocked: false }
    }

    const fingerprint = computeToolFingerprint(toolName, args)
    let chain = this.sessionChains.get(sessionId)
    if (!chain) {
      chain = { consecutiveCount: 0 }
      this.sessionChains.set(sessionId, chain)
    }

    if (chain.lastFingerprint === fingerprint) {
      chain.consecutiveCount += 1
    } else {
      chain.lastFingerprint = fingerprint
      chain.consecutiveCount = 1
    }

    const count = chain.consecutiveCount

    // 达到硬阻断上限
    if (count >= this.blockThreshold) {
      return {
        blocked: true,
        blockReason: `[RepeatToolGuard] Execution blocked: Tool "${toolName}" has been called ${count} consecutive times with identical arguments. Stop repeating the same call and choose a different strategy or finish the task.`,
      }
    }

    // 渐进式提醒生成
    if (this.warningThresholds.includes(count)) {
      const reminder = this.buildReminder(toolName, args, count)
      return {
        blocked: false,
        reminder,
      }
    }

    return { blocked: false }
  }

  private buildReminder(toolName: string, args: unknown, count: number): string {
    if (count === this.warningThresholds[0]) {
      return (
        `\n\n[Warning: You are repeating the exact same tool call ("${toolName}") with identical arguments for ${count} consecutive times. ` +
        `Carefully analyze the previous result before calling again. If the approach is not working, try a different action or parameters.]`
      )
    }

    const canonicalStr = JSON.stringify(canonicalizeValue(args))
    const preview =
      canonicalStr.length > this.argumentsPreviewChars
        ? `${canonicalStr.slice(0, this.argumentsPreviewChars)}... (+${canonicalStr.length - this.argumentsPreviewChars} more chars)`
        : canonicalStr

    return (
      `\n\n[Critical Warning: Repeated tool call detected: tool="${toolName}", consecutive_calls=${count}, args=${preview}. ` +
      `The repeated calls are making no progress. Do not repeat this exact call. Choose an alternative strategy, different parameters, or conclude the task.]`
    )
  }
}

export const repeatToolGuard = new RepeatToolGuard()
