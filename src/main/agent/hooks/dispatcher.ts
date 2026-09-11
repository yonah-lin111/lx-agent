import type { HookEventName } from "@shared/contracts/agent"
import { runHookCommand } from "./commandRunner"
import { parseHookOutput } from "./outputParser"
import type {
  HookCommandOutput,
  HookCommandPayload,
  HookDispatchResult,
  HookRunResult,
  LoadedHook,
} from "./types"

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
  durationMs: 0,
  stdoutTruncated: false,
  stderrTruncated: false,
})

/**
 * 串行派发：配置顺序即执行顺序，每个 hook 独立产出 HookRunResult。
 * 失败一律 fail-open（仅记录 failed 结果，绝不抛错）。
 */
export const dispatchHooks = async (
  hooks: LoadedHook[],
  context: HookDispatchContext,
): Promise<HookDispatchResult> => {
  const runs: HookRunResult[] = []

  for (const hook of hooks) {
    if (hook.event !== context.event) continue
    if (!matchesHook(hook, context.toolName)) continue

    const startedAt = Date.now()
    let output: HookCommandOutput
    try {
      output = await runHookCommand({
        hook,
        payload: buildHookPayload(context),
        cwd: context.cwd,
      })
    } catch {
      output = failedOutput()
    }
    const parsed = parseHookOutput(context.event, output)
    runs.push({
      hook,
      status: parsed.status,
      message: {
        role: "hookContext",
        event: context.event,
        hookName: hook.name,
        status: parsed.status,
        text: parsed.text,
        durationMs: output.durationMs,
        timestamp: startedAt,
      },
      ...(parsed.additionalContext ? { additionalContext: parsed.additionalContext } : {}),
      ...(parsed.block ? { block: parsed.block } : {}),
      ...(parsed.stop ? { stop: parsed.stop } : {}),
      ...(parsed.permission ? { permission: parsed.permission } : {}),
    })
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
