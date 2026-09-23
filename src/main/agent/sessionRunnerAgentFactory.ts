import type { AgentMessage, PromptAssembly, SandboxPolicy } from "@shared/contracts/agent"
import { normalizeCollaborationMode } from "@shared/contracts/agent"
import { getSubagentSettings } from "@/services/settingsService"
import {
  ALL_TOOL_NAMES,
  type BuildSystemPromptOptions,
  buildSystemPromptSync,
  createRegistry,
  resolveConnectedMcpServers,
  resolveCwd,
} from "./assembly"
import { createCompactionSummaryMessage } from "./compaction"
import { pruneHistoricalToolOutputs } from "./compaction/contextPruner"
import { Agent } from "./core/agent"
import type { Model } from "./core/types"
import { hookResultMessages, hooksManager } from "./hooks"
import { lspManager } from "./lsp/lspManager"
import { sanitizeMcpNameSegment } from "./mcp/mcpManager"
import { permissionManager } from "./permissions/permissionManager"
import { defaultSystemPromptManager } from "./prompts/systemPromptManager"
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

// 按角色 MCP 白名单收窄 server 列表（未配置白名单时继承全部已连接 server）。
const narrowMcpServers = (servers: string[], allowed?: string[]): string[] => {
  if (allowed === undefined) return servers
  const allowedNames = new Set(allowed.map((name) => sanitizeMcpNameSegment(name)))
  return servers.filter((name) => allowedNames.has(sanitizeMcpNameSegment(name)))
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

  const availableMcpServers = resolveConnectedMcpServers()
  const systemPrompt = buildSystemPromptSync({
    cwd,
    sessionId: host.currentSessionId ?? undefined,
    modelId: model.id,
    sandboxPolicy,
    collaborationMode: host.collaborationMode,
    contextUsage,
    activeSkills,
    mcpServers: availableMcpServers,
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
    mcpServers: availableMcpServers,
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
      // 角色技能白名单收窄 available_skills 注入（与 read_skill 工具同源）。
      renderSubagentSystemPrompt: (allowedSkills, allowedMcpServers) =>
        buildSystemPromptSync({
          cwd,
          sessionId: host.currentSessionId ?? undefined,
          modelId: model.id,
          sandboxPolicy,
          collaborationMode: subagentMode,
          contextUsage,
          activeSkills:
            allowedSkills === undefined
              ? activeSkills
              : activeSkills.filter((skill) => allowedSkills.includes(skill.name)),
          mcpServers: narrowMcpServers(availableMcpServers, allowedMcpServers),
          personality,
        }),
      model,
      sandboxPolicy,
      subagentPool: host.subagentPool,
      subagentSettings,
      subagentRuntime,
      collaborationMode: host.collaborationMode,
      beforeToolCall: (context, signal) =>
        beforeToolCallWithGuard(host, context, signal, subagentMode, cwd, host.collaborationMode),
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

/**
 * 组装完整系统提示（含环境变量与激活工具清单），供只读预览使用。
 */
export const getPromptAssembly = async (
  host: SessionRunnerHost,
  cwd?: string,
): Promise<PromptAssembly> => {
  const targetCwd = cwd ?? host.cwd ?? host.requestedCwd ?? resolveCwd() ?? ""
  const targetSessionId = host.currentSessionId ?? undefined
  const activeSkills = host.activeSkills
  const currentSandboxPolicy = permissionManager.getSandboxPolicy()
  const modelId = host.agent?.state.model.id
  const contextUsage = host.compactor.getUsage()

  const assembly = await defaultSystemPromptManager.assemble({
    cwd: targetCwd,
    sessionId: targetSessionId,
    modelId,
    sandboxPolicy: currentSandboxPolicy,
    collaborationMode: host.collaborationMode,
    contextUsage,
    activeSkills,
    mcpServers: resolveConnectedMcpServers(),
  })

  const activeTools: string[] = host.registry
    ? host.registry.getAll().map((tool) => tool.name)
    : Array.from(ALL_TOOL_NAMES)

  return {
    ...assembly,
    activeTools,
  }
}
