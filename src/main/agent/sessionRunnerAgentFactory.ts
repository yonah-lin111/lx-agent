import type { AgentMessage, SandboxPolicy } from "@shared/contracts/agent"
import { normalizeCollaborationMode } from "@shared/contracts/agent"
import { getSubagentSettings } from "@/services/settingsService"
import { type BuildSystemPromptOptions, buildSystemPromptSync, createRegistry } from "./assembly"
import { createCompactionSummaryMessage } from "./compaction"
import { pruneHistoricalToolOutputs } from "./compaction/contextPruner"
import { Agent } from "./core/agent"
import type { Model } from "./core/types"
import { hookResultMessages, hooksManager } from "./hooks"
import { lspManager } from "./lsp/lspManager"
import { questionManager } from "./question/questionManager"
import type { SessionRunnerHost } from "./sessionRunner.types"
import { createTodoStateMessage } from "./sessionRunnerInput"
import {
  afterToolCallWithGuard,
  beforeToolCallWithGuard,
  dispatchPostToolUse,
  dispatchPreToolUse,
} from "./sessionRunnerToolHooks"
import type { LoadedSkill } from "./skills/skillLoader"
import { createAiSdkStreamFn } from "./stream/aiSdkStreamFn"
import { modelSupportsImageInput } from "./stream/modelCapabilities"
import { SubagentRuntime } from "./subagent/subagentRuntime"
import type { ToolRegistry } from "./tools/registry"

// 会话装配输入：本次重建使用的快照值。
export interface SessionAgentBuildInput {
  cwd: string
  model: Model
  sandboxPolicy: SandboxPolicy
  contextUsage: BuildSystemPromptOptions["contextUsage"]
  activeCapabilities: string[]
  activeMcp: string[]
  activeSkills: LoadedSkill[]
  personality?: BuildSystemPromptOptions["personality"]
}

// 会话装配结果：新建的 Agent、工具注册表与子代理运行时。
export interface SessionAgentBuildResult {
  agent: Agent
  registry: ToolRegistry
  subagentRuntime: SubagentRuntime
}

/**
 * 构建会话 Agent 与工具注册表：系统提示、能力装配、子代理运行时与工具安全回调在此接线。
 */
export const buildSessionAgent = (
  host: SessionRunnerHost,
  input: SessionAgentBuildInput,
): SessionAgentBuildResult => {
  const {
    cwd,
    model,
    sandboxPolicy,
    contextUsage,
    activeCapabilities,
    activeMcp,
    activeSkills,
    personality,
  } = input

  const systemPrompt = buildSystemPromptSync({
    cwd,
    sessionId: host.currentSessionId ?? undefined,
    modelId: model.id,
    sandboxPolicy,
    collaborationMode: host.collaborationMode,
    contextUsage,
    activeSkills,
    personality,
  })
  // 会话装配时快照子代理设置：设置保存仅对新会话生效。
  const subagentSettings = getSubagentSettings()
  // 子代理协作模式由设置决定（缺省 build），不继承主 agent 模式。
  const subagentMode = normalizeCollaborationMode(subagentSettings.mode)
  const subagentSystemPrompt = buildSystemPromptSync({
    cwd,
    sessionId: host.currentSessionId ?? undefined,
    modelId: model.id,
    sandboxPolicy,
    collaborationMode: subagentMode,
    contextUsage,
    activeSkills,
    personality,
  })
  const subagentRuntime =
    host.subagentRuntime ?? new SubagentRuntime(subagentSettings.maxConcurrent)
  const registry = createRegistry(
    cwd,
    activeCapabilities,
    activeMcp,
    activeSkills.length > 0,
    {
      subagentSystemPrompt,
      model,
      sandboxPolicy,
      subagentPool: host.subagentPool,
      subagentSettings,
      subagentRuntime,
      beforeToolCall: (context, signal) =>
        beforeToolCallWithGuard(host, context, signal, subagentMode, cwd),
      afterToolCall: async (context) => afterToolCallWithGuard(host, context),
      preToolUse: (context, signal) => dispatchPreToolUse(host, context, cwd, signal),
      postToolUse: (context, signal) => dispatchPostToolUse(host, context, cwd, signal),
      getCwd: () => host.cwd ?? cwd,
      recordChildCall: (parentToolCallId, child) =>
        host.turnStore.recordChildCall(parentToolCallId, child),
    },
    {
      askQuestion: (questions, toolCallId, signal) =>
        questionManager.ask(questions, host.currentSessionId, toolCallId, signal),
    },
    {
      lspManager,
      getSessionId: () => host.currentSessionId,
      cwd,
    },
    {
      getSessionId: () => host.currentSessionId,
      supportsImages: () => modelSupportsImageInput(model.provider, model.id),
    },
  )
  const agent = new Agent({
    streamFn: createAiSdkStreamFn({
      purpose: "chat",
      getSessionId: () => host.currentSessionId,
    }),
    beforeToolCall: async (context, signal) => {
      host.currentTurnContext?.recordToolCall()
      return beforeToolCallWithGuard(host, context, signal, host.collaborationMode, cwd)
    },
    afterToolCall: async (context) => afterToolCallWithGuard(host, context),
    preToolUse: (context, signal) => dispatchPreToolUse(host, context, cwd, signal),
    postToolUse: (context, signal) => dispatchPostToolUse(host, context, cwd, signal),
    onAgentStop: async () => {
      const messages: AgentMessage[] = host.agent?.state.messages ?? []
      const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant")
      const lastAssistantMessage =
        lastAssistant?.role === "assistant"
          ? lastAssistant.content
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("\n")
          : ""
      const result = await hooksManager.dispatch({
        event: "Stop",
        sessionId: host.currentSessionId,
        cwd: host.cwd,
        model: host.agent?.state.model.id,
        payload: { last_assistant_message: lastAssistantMessage },
      })
      return hookResultMessages(result)
    },
    transformContext: async (messages) => {
      const prunedMessages = pruneHistoricalToolOutputs(messages)
      const todoList = host.turnStore.getTodo()
      const todoMessage = todoList.length > 0 ? [createTodoStateMessage(todoList)] : []
      const boundary = host.compactor.getBoundary()
      if (!boundary) return [...todoMessage, ...prunedMessages]
      const messageSeqs = host.turnStore.getMessageSeqs()
      const kept = prunedMessages.filter((_, index) => {
        const seq = messageSeqs[index] ?? -1
        return seq < 0 || seq >= boundary.firstKeptSeq
      })
      return [
        ...todoMessage,
        createCompactionSummaryMessage(
          boundary.summary,
          boundary.tokensBefore,
          boundary.manual,
          boundary.model,
        ),
        ...kept,
      ]
    },
    initialState: {
      systemPrompt,
      model,
      tools: registry.getActive(),
    },
  })

  return { agent, registry, subagentRuntime }
}
