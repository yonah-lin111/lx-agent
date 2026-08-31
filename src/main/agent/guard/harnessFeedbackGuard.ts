/**
 * 运行时执行自愈与反馈守卫 (HarnessFeedbackGuard)
 *
 * 对齐 Codex 中的 Harness 警告和自愈反馈机制：
 * 当检测到工具执行产生过长输出、进程异常、Patch 匹配失败等情况时，
 * 自动向 Agent 的下一步上下文生成规范化的自愈提示，防止循环试错。
 */

export interface ExecutionFeedback {
  toolName: string
  exitCode?: number
  isTruncated?: boolean
  errorDetail?: string
}

export class HarnessFeedbackGuard {
  /**
   * 评估执行反馈，生成针对模型的修正引导
   */
  public static evaluateFeedback(feedback: ExecutionFeedback): string | null {
    if (feedback.isTruncated) {
      return [
        "<harness_warning>",
        `Output from tool '${feedback.toolName}' was truncated due to buffer limits.`,
        "Do not request the entire output again. Narrow down your query, use line offsets, or filter via search tools.",
        "</harness_warning>",
      ].join("\n")
    }

    if (feedback.toolName === "apply_patch" && feedback.errorDetail?.includes("Hunk")) {
      return [
        "<harness_warning>",
        "The patch failed to apply because target file contents have changed or line context did not match.",
        "Read the latest file content first, then formulate a fresh patch or use edit/write directly.",
        "</harness_warning>",
      ].join("\n")
    }

    return null
  }
}
