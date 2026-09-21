import type { AgentMessage, CollaborationMode } from "@shared/contracts/agent"
import type {
  AfterToolCallContext,
  AfterToolCallResult,
  BeforeToolCallContext,
  BeforeToolCallResult,
  ToolHookResult,
} from "./core/types"
import { repeatToolGuard } from "./guard/repeatToolGuard"
import { firstBlock, firstStop, hookResultMessages, hooksManager } from "./hooks"
import { permissionManager } from "./permissions/permissionManager"
import type { SessionRunnerHost } from "./sessionRunner.types"

// 守卫/ hook 协作面：仅需会话标识、模型 id、cwd 与提醒暂存。
type ToolHooksHost = Pick<
  SessionRunnerHost,
  "currentSessionId" | "agent" | "guardReminders" | "sessionStartFired" | "getEffectiveCwd"
>

// 派发 SessionStart（每个会话一次）与 UserPromptSubmit；提交被拒绝时返回 error。
export const dispatchPromptHooks = async (
  host: ToolHooksHost,
  prompt: string,
  isNewSession: boolean,
): Promise<{ messages: AgentMessage[] } | { error: string }> => {
  const messages: AgentMessage[] = []
  if (!host.sessionStartFired) {
    const startResult = await hooksManager.dispatch({
      event: "SessionStart",
      sessionId: host.currentSessionId,
      cwd: host.getEffectiveCwd(),
      model: host.agent?.state.model.id,
      payload: { source: isNewSession ? "startup" : "resume" },
    })
    messages.push(...hookResultMessages(startResult))
    host.sessionStartFired = true
  }

  const submitResult = await hooksManager.dispatch({
    event: "UserPromptSubmit",
    sessionId: host.currentSessionId,
    cwd: host.getEffectiveCwd(),
    model: host.agent?.state.model.id,
    payload: { prompt },
  })
  const stop = firstStop(submitResult)
  if (stop) {
    // 提交被拒绝：SessionStart 视为未发生，允许用户重试。
    host.sessionStartFired = false
    return { error: stop.reason || "Prompt submission was rejected by a hook." }
  }
  messages.push(...hookResultMessages(submitResult))
  return { messages }
}

// 重复调用守卫 + 权限门控（主/子代理共用）；提醒暂存到 toolCallId，由 afterToolCall 附加。
// parentMode 仅子代理调用传入：父会话协作模式的硬基线对派发的子代理同样生效。
export const beforeToolCallWithGuard = (
  host: ToolHooksHost,
  context: BeforeToolCallContext,
  signal: AbortSignal | undefined,
  collaborationMode: CollaborationMode,
  cwd: string,
  parentMode?: CollaborationMode,
): Promise<BeforeToolCallResult | undefined> => {
  if (host.currentSessionId) {
    const guardResult = repeatToolGuard.record(
      host.currentSessionId,
      context.toolCall.name,
      context.args,
    )
    if (guardResult.blocked) {
      return Promise.resolve({ block: true, reason: guardResult.blockReason })
    }
    if (guardResult.reminder) {
      host.guardReminders.set(context.toolCall.id, guardResult.reminder)
    }
  }
  return permissionManager.gate(context, host.currentSessionId, signal, {
    collaborationMode,
    ...(parentMode !== undefined ? { parentMode } : {}),
    cwd,
  })
}

// 工具结果收尾：附加本调用的重复调用提醒（仅成功结果），随后清除暂存。
export const afterToolCallWithGuard = (
  host: ToolHooksHost,
  context: AfterToolCallContext,
): AfterToolCallResult | undefined => {
  const reminder = host.guardReminders.get(context.toolCall.id)
  if (reminder === undefined) return undefined
  host.guardReminders.delete(context.toolCall.id)
  if (context.isError) return undefined
  return { content: [...context.result.content, { type: "text", text: reminder }] }
}

// PreToolUse hook 派发（权限解析后）；可阻断并注入审计消息。
export const dispatchPreToolUse = async (
  host: ToolHooksHost,
  context: BeforeToolCallContext,
  cwd: string,
  signal?: AbortSignal,
): Promise<ToolHookResult | undefined> => {
  const result = await hooksManager.dispatch({
    event: "PreToolUse",
    sessionId: host.currentSessionId,
    cwd,
    model: host.agent?.state.model.id,
    toolName: context.toolCall.name,
    payload: {
      tool_name: context.toolCall.name,
      tool_input: context.args,
      tool_use_id: context.toolCall.id,
    },
    signal,
  })
  const block = firstBlock(result)
  return {
    ...(block ? { block } : {}),
    messages: hookResultMessages(result),
  }
}

// PostToolUse hook 派发：仅注入审计消息。
export const dispatchPostToolUse = async (
  host: ToolHooksHost,
  context: AfterToolCallContext,
  cwd: string,
  signal?: AbortSignal,
): Promise<ToolHookResult | undefined> => {
  const toolResponse = context.result.content
    .map((contentBlock) => (contentBlock.type === "text" ? contentBlock.text : "[image]"))
    .join("\n")
  const result = await hooksManager.dispatch({
    event: "PostToolUse",
    sessionId: host.currentSessionId,
    cwd,
    model: host.agent?.state.model.id,
    toolName: context.toolCall.name,
    payload: {
      tool_name: context.toolCall.name,
      tool_input: context.args,
      tool_use_id: context.toolCall.id,
      tool_response: toolResponse,
    },
    signal,
  })
  return { messages: hookResultMessages(result) }
}
