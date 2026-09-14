import type { HookEventName } from "@shared/contracts/agent"
import { runHookCommand } from "./commandRunner"
import { parseHookOutput } from "./outputParser"
import type {
  HookCommandOutput,
  HookCommandPayload,
  HookDispatchResult,
  HookRunResult,
  LoadedHook,
  ParsedHookOutput,
} from "./types"

// token → 字符换算沿用项目惯例（char/4，见 compaction.estimateMessageTokens）。
const CHARS_PER_TOKEN = 4

// additionalContext 超限截断标记（注入模型上下文，使用英文）。
const truncationMarker = (limit: number): string =>
  `\n\n[hook additional context truncated: exceeded ${limit} tokens]`

export interface HookDispatchContext {
  event: HookEventName
  sessionId?: string | null
  turnId?: string
  cwd: string
  model?: string
  permissionMode?: string
  toolName?: string
  // 事件私有字段（snake_case，直接并入 stdin payload）。
  payload?: Record<string, unknown>
  // 取消通道：中止时停止派发剩余 hook，并杀在途子进程。
  signal?: AbortSignal
}

// matcher 严格精确匹配工具名；无 matcher 或非工具事件恒通过。
export const matchesHook = (hook: LoadedHook, toolName?: string): boolean => {
  if (!hook.matcher || !toolName) return true
  return hook.matcher.includes(toolName)
}

// 归一 stdin payload（公共字段 + 事件私有字段）。
export const buildHookPayload = (context: HookDispatchContext): HookCommandPayload => {
  return {
    ...(context.sessionId ? { session_id: context.sessionId } : {}),
    ...(context.turnId ? { turn_id: context.turnId } : {}),
    cwd: context.cwd,
    hook_event_name: context.event,
    ...(context.model ? { model: context.model } : {}),
    ...(context.permissionMode ? { permission_mode: context.permissionMode } : {}),
    ...(context.toolName ? { tool_name: context.toolName } : {}),
    ...(context.payload ?? {}),
  }
}

const failedOutput = (): HookCommandOutput => ({
  exitCode: null,
  stdout: "",
  stderr: "",
  timedOut: false,
  spawnFailed: true,
  aborted: false,
  durationMs: 0,
  stdoutTruncated: false,
  stderrTruncated: false,
})

/**
 * 按条目上限截断 additionalContext：token 以 char/4 换算；
 * 超限截断并附英文标记；`0` 禁用注入（返回 undefined）。
 */
export const clampAdditionalContext = (
  text: string | undefined,
  limit: number,
): string | undefined => {
  if (!text) return undefined
  if (limit <= 0) return undefined
  const maxChars = limit * CHARS_PER_TOKEN
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}${truncationMarker(limit)}`
}

// additionalContext 被禁用时回退到其余审计文本（与 parseHookOutput 优先级一致）。
const fallbackText = (parsed: ParsedHookOutput): string =>
  parsed.block?.reason ||
  parsed.permission?.reason ||
  parsed.stop?.reason ||
  parsed.systemMessage ||
  ""

/**
 * 串行派发：配置顺序即执行顺序，每个 hook 独立产出 HookRunResult。
 * 失败一律 fail-open（仅记录 failed 结果，绝不抛错）；signal 中止时停止派发剩余 hook。
 */
export const dispatchHooks = async (
  hooks: LoadedHook[],
  context: HookDispatchContext,
): Promise<HookDispatchResult> => {
  const runs: HookRunResult[] = []

  for (const hook of hooks) {
    if (hook.event !== context.event) continue
    if (!matchesHook(hook, context.toolName)) continue
    // 已中止：不再启动后续 hook（在途 hook 由 commandRunner 收尾）。
    if (context.signal?.aborted) break

    const startedAt = Date.now()
    let output: HookCommandOutput
    try {
      output = await runHookCommand({
        hook,
        payload: buildHookPayload(context),
        cwd: context.cwd,
        signal: context.signal,
      })
    } catch {
      output = failedOutput()
    }
    const parsed = parseHookOutput(context.event, output)
    const additionalContext = clampAdditionalContext(
      parsed.additionalContext,
      hook.additionalContextLimit,
    )
    const text =
      additionalContext ?? (parsed.additionalContext ? fallbackText(parsed) : parsed.text)
    runs.push({
      hook,
      status: parsed.status,
      message: {
        role: "hookContext",
        event: context.event,
        hookName: hook.name,
        status: parsed.status,
        text,
        durationMs: output.durationMs,
        timestamp: startedAt,
      },
      ...(additionalContext ? { additionalContext } : {}),
      ...(parsed.block ? { block: parsed.block } : {}),
      ...(parsed.stop ? { stop: parsed.stop } : {}),
      ...(parsed.permission ? { permission: parsed.permission } : {}),
    })
    // 本 hook 被中止：结束派发（不启动后续 hook）。
    if (output.aborted) break
  }

  return { runs }
}

// 第一个成功阻断（failed 结果不覆盖）。
export const firstBlock = (result: HookDispatchResult): { reason: string } | undefined => {
  for (const run of result.runs) {
    if (run.status === "blocked" && run.block) return run.block
  }
  return undefined
}

// 第一个成功停止请求（UserPromptSubmit）。
export const firstStop = (result: HookDispatchResult): { reason?: string } | undefined => {
  for (const run of result.runs) {
    if (run.stop) return run.stop
  }
  return undefined
}

// 第一个成功审批决策（PermissionRequest）。
export const firstPermissionDecision = (
  result: HookDispatchResult,
): { decision: "allow" | "deny"; reason?: string } | undefined => {
  for (const run of result.runs) {
    if (run.permission) return run.permission
  }
  return undefined
}

// 派发产物消息（含 failed/blocked，供 FlowList 审计与落位注入）。
export const hookResultMessages = (result: HookDispatchResult): HookRunResult["message"][] =>
  result.runs.map((run) => run.message)
