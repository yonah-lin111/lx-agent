import type { HookEventName } from "@shared/contracts/agent"
import type { HookCommandOutput, ParsedHookOutput } from "./types"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const failed = (): ParsedHookOutput => ({ status: "failed", text: "" })

/**
 * 输出解析与决策归一（严格 JSON，fail-open）：
 * - PreToolUse：exit 2 + stderr 或 decision:block → blocked；
 * - 空 stdout = 成功无输出；纯文本忽略；`{` 开头但解析失败 = failed；
 * - PermissionRequest 仅 hookSpecificOutput.decision.behavior 为 allow/deny 时生效；
 * - UserPromptSubmit continue:false → stop；其余事件降级为 systemMessage 警告；
 * - 任一字段非法（含预留 updatedInput）→ failed，不产生效果。
 */
export const parseHookOutput = (
  event: HookEventName,
  output: HookCommandOutput,
): ParsedHookOutput => {
  if (output.spawnFailed || output.timedOut) return failed()

  const exitCode = output.exitCode ?? 0
  if (event === "PreToolUse" && exitCode === 2) {
    const reason = output.stderr.trim() || "Blocked by hook"
    return { status: "blocked", text: reason, block: { reason } }
  }
  if (exitCode !== 0) {
    return { status: "failed", text: output.stderr.trim() }
  }

  const stdout = output.stdout.trim()
  if (!stdout) return { status: "completed", text: "" }
  // 纯文本输出忽略（不注入、不报错）。
  if (!stdout.startsWith("{")) return { status: "completed", text: "" }

  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return failed()
  }
  if (!isRecord(raw)) return failed()
  // V1 不支持输入改写：预留字段出现即视为非法。
  if ("updatedInput" in raw) return failed()

  if ("continue" in raw && typeof raw.continue !== "boolean") return failed()
  if ("stopReason" in raw && typeof raw.stopReason !== "string") return failed()
  if ("suppressOutput" in raw && typeof raw.suppressOutput !== "boolean") return failed()
  if ("systemMessage" in raw && typeof raw.systemMessage !== "string") return failed()
  if ("decision" in raw && typeof raw.decision !== "string") return failed()
  if ("reason" in raw && typeof raw.reason !== "string") return failed()
  if (
    event === "PreToolUse" &&
    raw.decision !== undefined &&
    raw.decision !== "approve" &&
    raw.decision !== "block"
  ) {
    return failed()
  }

  let additionalContext: string | undefined
  let permission: { decision: "allow" | "deny"; reason?: string } | undefined

  const hookSpecific = raw.hookSpecificOutput
  if (hookSpecific !== undefined) {
    if (!isRecord(hookSpecific)) return failed()
    if ("updatedInput" in hookSpecific) return failed()
    if ("hookEventName" in hookSpecific && typeof hookSpecific.hookEventName !== "string")
      return failed()
    if ("additionalContext" in hookSpecific) {
      if (typeof hookSpecific.additionalContext !== "string") return failed()
      additionalContext = hookSpecific.additionalContext.trim() || undefined
    }
    const decisionRaw = hookSpecific.decision
    if (decisionRaw !== undefined) {
      if (!isRecord(decisionRaw)) return failed()
      if (
        "behavior" in decisionRaw &&
        decisionRaw.behavior !== "allow" &&
        decisionRaw.behavior !== "deny"
      ) {
        return failed()
      }
      if ("message" in decisionRaw && typeof decisionRaw.message !== "string") return failed()
      if (event === "PermissionRequest") {
        const behavior = decisionRaw.behavior
        if (behavior === "allow" || behavior === "deny") {
          const message = typeof decisionRaw.message === "string" ? decisionRaw.message.trim() : ""
          permission = { decision: behavior, ...(message ? { reason: message } : {}) }
        }
      }
    }
  }

  const systemMessage = typeof raw.systemMessage === "string" ? raw.systemMessage.trim() : ""
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : ""
  const stopReason = typeof raw.stopReason === "string" ? raw.stopReason.trim() : ""

  const block =
    event === "PreToolUse" && raw.decision === "block"
      ? { reason: reason || "Blocked by hook" }
      : undefined

  const stop =
    raw.continue === false && event === "UserPromptSubmit"
      ? { ...(stopReason ? { reason: stopReason } : {}) }
      : undefined

  const downgradedStop =
    raw.continue === false && event !== "UserPromptSubmit"
      ? stopReason
        ? `Hook requested stop: ${stopReason}`
        : "Hook requested stop"
      : ""

  const text =
    additionalContext ||
    block?.reason ||
    permission?.reason ||
    stop?.reason ||
    systemMessage ||
    downgradedStop

  return {
    status: block ? "blocked" : "completed",
    text,
    ...(additionalContext ? { additionalContext } : {}),
    ...(systemMessage ? { systemMessage } : {}),
    ...(block ? { block } : {}),
    ...(stop ? { stop } : {}),
    ...(permission ? { permission } : {}),
  }
}
