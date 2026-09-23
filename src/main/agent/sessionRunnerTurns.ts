import { existsSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { AgentSendResult, ModelSwitchMessage, UserMessage } from "@shared/contracts/agent"
import { agentSessionService } from "@/services/agentSessionService"
import { getAppDataRoot } from "../paths"
import { buildSystemPromptSync, resolveConnectedMcpServers, resolveCwd } from "./assembly"
import { TurnContext } from "./core/turnContext"
import { mcpManager } from "./mcp/mcpManager"
import { permissionManager } from "./permissions/permissionManager"
import type { SessionRunnerHost } from "./sessionRunner.types"
import { expandAndDetectCommand, processPendingFiles } from "./sessionRunnerInput"
import { kickDrain } from "./sessionRunnerQueue"
import { dispatchPromptHooks } from "./sessionRunnerToolHooks"
import { generateSessionTitle } from "./titleGenerator"
import { type AttachedFile, isOverflowFailure } from "./turnStore"

/**
 * 轮次执行：单轮发送、续写、轮次上下文生命周期与标题生成。
 */
export const runSessionTurn = async (
  host: SessionRunnerHost,
  text: string,
  files?: AttachedFile[],
  overrideCwd?: string,
): Promise<AgentSendResult> => {
  const agent = host.agent
  if (!agent) {
    return { ok: false, error: "Agent 尚未就绪，请重试。" }
  }
  const isNewSession = !host.currentSessionId
  if (isNewSession) {
    agent.state.messages = []
    host.turnStore.resetSeqs()
    host.compactor.setBoundary(null)
    host.turnStore.resetOverflow()
  }
  const { expanded, command } = expandAndDetectCommand(text, overrideCwd ?? host.getEffectiveCwd())
  // 生命周期 hook：SessionStart（每个会话一次）+ UserPromptSubmit（每次提交）。
  const promptHooks = await dispatchPromptHooks(host, expanded, isNewSession)
  if ("error" in promptHooks) {
    return { ok: false, error: promptHooks.error }
  }
  beginSessionTurn(host, text)
  host.turnStore.captureSnapshot()

  if (isNewSession && host.turnStore.getSessionInput()) {
    let createResult:
      | {
          sessionId: string
          initialModelMessage?: ModelSwitchMessage
          initialModelSeq?: number
        }
      | undefined
    agentSessionService.transaction(() => {
      createResult = host.turnStore.createSessionIfNeeded(
        host.turnStore.getSessionInput()!,
        new Date().toISOString(),
      )
    })
    // 事务提交成功后再对齐内存 seq（回滚不得留下幽灵 seq）。
    if (createResult?.initialModelSeq !== undefined) {
      host.turnStore.appendMessageSeq(createResult.initialModelSeq)
    }
    if (createResult?.initialModelMessage) {
      const initialModelMessage = createResult.initialModelMessage
      agent.state.appendMessage(initialModelMessage)
      host.emitEvent({
        type: "model_switch",
        message: initialModelMessage,
      })
    }
    if (host.currentSessionId) {
      generateTitle(host, host.currentSessionId, text)
    }
  }

  if (files && files.length > 0 && host.currentSessionId) {
    host.turnStore.setCopiedFiles(processPendingFiles(host.currentSessionId, files))
  } else {
    host.turnStore.clearCopiedFiles()
  }

  const effectiveCwd = host.cwd ?? resolveCwd() ?? homedir()
  host.currentTurnContext = new TurnContext({
    turnId: `turn-${Date.now()}`,
    sessionId: host.currentSessionId ?? "draft-session",
    cwd: effectiveCwd,
    modelSelection: host.requestedModel,
    capabilities: host.activeCapabilities,
    collaborationMode: host.collaborationMode,
  })

  try {
    const currentSandboxPolicy = permissionManager.getSandboxPolicy()
    const contextUsage = host.compactor.getUsage()
    const turnContext = host.currentTurnContext
    agent.state.systemPrompt = buildSystemPromptSync({
      cwd: turnContext.snapshot.cwd,
      sessionId: host.currentSessionId ?? undefined,
      modelId: agent.state.model.id,
      sandboxPolicy: currentSandboxPolicy,
      collaborationMode: host.collaborationMode,
      contextUsage,
      activeSkills: host.activeSkills,
      mcpServers: resolveConnectedMcpServers(),
      personality: host.personality,
      variables: turnContext.snapshot.variables,
    })
    const userMessage: UserMessage = {
      role: "user",
      content: expanded,
      timestamp: Date.now(),
      ...(command ? { command } : {}),
    }
    // hook 注入消息先于本轮用户消息落位。
    await agent.prompt(
      promptHooks.messages.length > 0 ? [...promptHooks.messages, userMessage] : userMessage,
    )

    if (host.turnStore.consumeOverflow()) {
      removeLastOverflowMessage(host)
      const compacted = await host.compactor.compactIfNeeded(true)
      if (!compacted) {
        throw new Error("上下文超出模型窗口且自动压缩失败，请新建会话或重试。")
      }
      beginSessionTurn(host, text)
      await agent.continue()
      if (host.turnStore.consumeOverflow()) {
        removeLastOverflowMessage(host)
        throw new Error("上下文压缩后仍超出模型窗口，请新建会话或减少会话长度。")
      }
    } else {
      await host.compactor.compactIfNeeded(false)
    }
  } catch (error) {
    discardPendingTurn(host)
    host.currentTurnContext = undefined
    if (
      isNewSession &&
      host.currentSessionId &&
      !host.turnStore.hasSessionMessages(host.currentSessionId)
    ) {
      const sessionIdToDelete = host.currentSessionId
      agentSessionService.deleteSession(sessionIdToDelete)
      host.setSessionId(null)
      host.sessionBinding = null

      try {
        const sessionDir = join(getAppDataRoot(), "session", sessionIdToDelete)
        if (existsSync(sessionDir)) {
          rmSync(sessionDir, { recursive: true, force: true })
        }
      } catch (err) {
        console.error(
          `Failed to clean up failed session attachments directory: ${sessionIdToDelete}`,
          err,
        )
      }
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  if (!host.currentSessionId) {
    return { ok: false, error: "会话持久化失败。" }
  }
  return { ok: true, sessionId: host.currentSessionId }
}

export const continueChat = async (
  host: SessionRunnerHost,
  prompt?: string,
): Promise<AgentSendResult> => {
  await mcpManager.ensureConnected()
  if (host.isBusy()) {
    return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
  }
  const ready = host.ensureReady()
  if ("error" in ready) {
    return { ok: false, error: ready.error }
  }
  const { agent } = ready
  if (!host.currentSessionId) {
    return { ok: false, error: "没有可继续的会话。" }
  }

  const lastMessage = agent.state.messages[agent.state.messages.length - 1]
  const isInterrupted =
    lastMessage?.role === "assistant" &&
    (lastMessage.stopReason === "length" || lastMessage.stopReason === "aborted")
  if (!isInterrupted) {
    return { ok: false, error: "当前没有可继续的对话。" }
  }

  const continueText = prompt?.trim() || "请继续输出刚才被中断的内容。"
  agent.steer({ role: "user", content: continueText, timestamp: Date.now() })
  beginSessionTurn(host, continueText)
  host.turnStore.captureSnapshot()
  try {
    await agent.continue()
    if (host.turnStore.consumeOverflow()) {
      removeLastOverflowMessage(host)
      throw new Error("上下文超出模型窗口，请新建会话或重试。")
    }
    await host.compactor.compactIfNeeded(false)
  } catch (error) {
    discardPendingTurn(host)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  void kickDrain(host)
  return { ok: true, sessionId: host.currentSessionId }
}

// 开启一轮会话记录：登记 binding/cwd/能力快照与模型选择。
export const beginSessionTurn = (host: SessionRunnerHost, text: string): void => {
  host.turnStore.beginTurn({
    text,
    binding: host.sessionBinding ?? {},
    cwd: host.cwd ?? "",
    capabilities: {
      tools: [...host.activeCapabilities],
      mcp: [...host.activeMcp],
      skills: host.activeSkills.map((skill) => skill.name),
    },
    modelSelection: host.requestedModel,
  })
}

// 丢弃进行中的轮次记录（失败/中断时回收快照）。
export const discardPendingTurn = (host: SessionRunnerHost): void => {
  host.turnStore.discardTurn()
}

// 移除末尾连续的上下文溢出失败消息。
export const removeLastOverflowMessage = (host: SessionRunnerHost): void => {
  const state = host.agent?.state
  if (!state) return
  while (
    state.messages.length > 0 &&
    isOverflowFailure(state.messages[state.messages.length - 1])
  ) {
    state.removeLastMessage()
  }
}

// 生成会话标题：先下发 pending，再异步生成并更新（会话已切换则只回填标题）。
export const generateTitle = (
  host: SessionRunnerHost,
  sessionId: string,
  userText: string,
): void => {
  host.emitEvent({ type: "session_title", sessionId, title: null })
  void generateSessionTitle(
    [{ role: "user", content: userText, timestamp: Date.now() }],
    sessionId,
  ).then((generated) => {
    const session = agentSessionService.getSession(sessionId)
    if (!session) return
    let title = session.title
    if (generated && host.currentSessionId === sessionId) {
      agentSessionService.renameSession(sessionId, generated, new Date().toISOString())
      title = generated
    }
    host.emitEvent({ type: "session_title", sessionId, title })
  })
}
