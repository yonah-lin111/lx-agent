import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import type {
  AgentCompactResult,
  AgentContextUsage,
  AgentEvent,
  AgentForkResult,
  AgentMessage,
  AgentRestoredSession,
  AgentSendContext,
  AgentSendOptions,
  AgentSendResult,
  AgentSessionSummary,
  AgentSwitchProjectResult,
  AgentSwitchWorktreeResult,
  AgentUndoCompactionResult,
  CollaborationMode,
  CopySessionOptions,
  CopySessionResult,
  ExportSessionOptions,
  ExportSessionResult,
  JobId,
  JobReadResult,
  JobSnapshot,
  JobStatus,
  ModelSwitchMessage,
  PromptAssembly,
  UndoSummaryMessage,
} from "@shared/contracts/agent"
import {
  createInitialSessionProjectionState,
  type SessionProjectionState,
} from "@shared/contracts/sessionProjection"
import type { ModelSelection } from "@shared/settings"
import { agentSessionService, createExternalId } from "@/services/agentSessionService"
import { getAppDataRoot } from "../paths"
import { copySessionText, exportSessionToFile } from "./export/sessionExporter"
import { jobRegistry } from "./jobs/jobRegistry"
import { AgentSessionRunner } from "./sessionRunner"
import { spillManager } from "./spill/spillManager"

/**
 * 多会话 Agent 管理器（Main 进程单例）：
 * 维护活跃会话的 AgentSessionRunner 实例池，提供基于 sessionId / tabId 的精准路由与全量并发执行。
 */
export class SessionRunnerManager {
  private runners = new Map<string, AgentSessionRunner>()
  private eventSink?: (event: AgentEvent) => void
  private lastActiveKey = "default"

  constructor() {
    void Promise.resolve().then(() => spillManager.cleanStaleSpills(7))
    jobRegistry.onJobEvent((event) => this.eventSink?.(event))
  }

  public attachEventSink(sink: (event: AgentEvent) => void): void {
    this.eventSink = sink
    for (const runner of this.runners.values()) {
      runner.setEventSink(sink)
    }
  }

  private resolveKey(sessionId?: string | null, tabId?: string): string {
    if (sessionId) return `sess:${sessionId}`
    if (tabId) return `tab:${tabId}`
    return "default"
  }

  public getOrCreateRunner(sessionId?: string | null, tabId?: string): AgentSessionRunner {
    const key = this.resolveKey(sessionId, tabId)
    this.lastActiveKey = key
    let runner = this.runners.get(key)
    if (!runner && sessionId) {
      // 检查是否有关联该 sessionId 的 tab 实例
      for (const r of this.runners.values()) {
        if (r.currentSessionId === sessionId) {
          this.runners.set(key, r)
          return r
        }
      }
    }
    if (!runner && tabId) {
      // 检查 tab 对应的 runner
      runner = this.runners.get(`tab:${tabId}`)
      if (runner && sessionId) {
        this.runners.set(key, runner)
      }
    }
    if (!runner) {
      runner = new AgentSessionRunner({
        sessionId: sessionId ?? null,
        tabId,
        eventSink: this.eventSink,
        onSessionCreated: (_r, oldKey, newSessionId) => {
          const newKey = `sess:${newSessionId}`
          this.runners.set(newKey, runner!)
          if (oldKey && oldKey !== newKey && !oldKey.startsWith("tab:")) {
            this.runners.delete(oldKey)
          }
        },
      })
      this.runners.set(key, runner)
      if (tabId) {
        this.runners.set(`tab:${tabId}`, runner)
      }
    } else {
      if (tabId && !runner.tabId) {
        runner.tabId = tabId
      }
      if (sessionId && runner.currentSessionId !== sessionId) {
        runner.setSessionId(sessionId)
      }
    }
    return runner
  }

  public getRunner(sessionId?: string | null, tabId?: string): AgentSessionRunner | undefined {
    const key = this.resolveKey(sessionId, tabId)
    let runner = this.runners.get(key)
    if (!runner && sessionId) {
      for (const r of this.runners.values()) {
        if (r.currentSessionId === sessionId) return r
      }
    }
    if (!runner && tabId) {
      runner = this.runners.get(`tab:${tabId}`)
    }
    if (!runner && this.runners.has(this.lastActiveKey)) {
      runner = this.runners.get(this.lastActiveKey)
    }
    return runner ?? this.runners.values().next().value
  }

  public getMessages(sessionId?: string, tabId?: string): AgentMessage[] {
    const runner = this.getRunner(sessionId, tabId)
    return runner?.getMessages() ?? []
  }

  public getActiveTools(sessionId?: string, tabId?: string) {
    const runner = this.getRunner(sessionId, tabId)
    return runner?.getActiveTools() ?? []
  }

  public async send(
    text: string,
    selection?: ModelSelection,
    context?: AgentSendContext,
    options?: AgentSendOptions,
  ): Promise<AgentSendResult> {
    const runner = this.getOrCreateRunner(context?.sessionId, context?.tabId)
    return runner.send(text, selection, context, options)
  }

  public async continue(
    prompt?: string,
    sessionId?: string,
    tabId?: string,
  ): Promise<AgentSendResult> {
    const runner = this.getRunner(sessionId, tabId)
    if (!runner) {
      return { ok: false, error: "未找到活动的 Agent 实例。" }
    }
    return runner.continue(prompt)
  }

  public abort(sessionId?: string, tabId?: string): void {
    if (sessionId || tabId) {
      const runner = this.getRunner(sessionId, tabId)
      runner?.abort()
    } else {
      for (const runner of this.runners.values()) {
        runner.abort()
      }
    }
  }

  public restoreMessages(messages: AgentMessage[], sessionId?: string, tabId?: string): void {
    const runner = this.getOrCreateRunner(sessionId, tabId)
    runner.restoreMessages(messages)
  }

  public async restoreSession(sessionId: string, tabId?: string): Promise<AgentRestoredSession> {
    const session = agentSessionService.getSession(sessionId)
    if (!session) {
      throw new Error("SESSION_NOT_FOUND")
    }
    const runner = this.getOrCreateRunner(sessionId, tabId)
    const { messages, seqs, capabilities, todos } = runner
      .getTurnStore()
      .readSessionEntries(sessionId)

    await runner.restoreSessionData(
      session.external_id,
      messages,
      seqs,
      todos,
      session.cwd,
      session.project_id,
      session.page,
    )

    return {
      messages: runner.getCompactor().withSummary(messages),
      activeCapabilities: capabilities,
      todos,
    }
  }

  public listSessions(): AgentSessionSummary[] {
    return agentSessionService.listSessions()
  }

  public getSessionProjection(sessionId?: string, tabId?: string): SessionProjectionState {
    const runner = this.getRunner(sessionId, tabId)
    return runner ? runner.getTurnStore().getProjection() : createInitialSessionProjectionState()
  }

  public deleteMessageTurn(sessionId: string, userMessageTimestamp: number): void {
    const allEntries = agentSessionService.listEntries(sessionId)
    let startSeq: number | undefined
    for (const entry of allEntries) {
      if (entry.type !== "message") continue
      try {
        const message = JSON.parse(entry.payload) as AgentMessage
        if (message.role === "user" && message.timestamp === userMessageTimestamp) {
          startSeq = entry.seq
          break
        }
      } catch {
        // 损坏 entry 跳过
      }
    }
    if (startSeq === undefined) return

    const turnEntryIds: string[] = []
    for (const entry of allEntries) {
      if (entry.seq < startSeq) continue
      if (entry.seq > startSeq && entry.type === "message") {
        let isUser = false
        try {
          isUser = (JSON.parse(entry.payload) as AgentMessage).role === "user"
        } catch {
          // 忽略
        }
        if (isUser) break
      }
      if (entry.type === "message" || entry.type === "todo") {
        turnEntryIds.push(entry.external_id)
      }
    }

    const runner = this.getRunner(sessionId)
    let isLastUserTurn = true
    for (const entry of allEntries) {
      if (entry.seq <= startSeq || entry.type !== "message") continue
      let isUser = false
      try {
        isUser = (JSON.parse(entry.payload) as AgentMessage).role === "user"
      } catch {
        // 忽略
      }
      if (isUser) {
        isLastUserTurn = false
        break
      }
    }
    if (isLastUserTurn && runner) {
      runner.getTurnStore().revertTurnFiles(sessionId, userMessageTimestamp)
    }

    // 提取被删除轮次的结构化数据用于生成持久化 undoSummary entry
    const turnEntries = allEntries.filter((e) => turnEntryIds.includes(e.external_id))
    let userPrompt = ""
    let userFiles: UndoSummaryMessage["undoPayload"] extends infer P
      ? P extends { files?: infer F }
        ? F
        : never
      : never = undefined
    let assistantSnippet = ""
    let assistantModel: string | undefined
    let turnDurationMs: number | undefined
    const diffs: NonNullable<UndoSummaryMessage["undoPayload"]>["diffs"] = []
    const toolCalls: NonNullable<UndoSummaryMessage["undoPayload"]>["toolCalls"] = []

    for (const entry of turnEntries) {
      if (entry.type === "message") {
        try {
          const msg = JSON.parse(entry.payload) as AgentMessage
          if (msg.role === "user") {
            const textContent = msg.content
              .filter(
                (c): c is Extract<(typeof msg.content)[number], { type: "text" }> =>
                  c.type === "text",
              )
              .map((c) => c.text)
              .join("\n")
            userPrompt = textContent
            if (msg.files) userFiles = msg.files
          } else if (msg.role === "assistant") {
            const textContent = msg.content
              .filter(
                (c): c is Extract<(typeof msg.content)[number], { type: "text" }> =>
                  c.type === "text",
              )
              .map((c) => c.text)
              .join("\n")
            assistantSnippet = textContent
            assistantModel = msg.model
            turnDurationMs = msg.durationMs
            for (const item of msg.content) {
              if (item.type === "toolCall") {
                const args = item.arguments
                const summary =
                  typeof args?.path === "string"
                    ? args.path
                    : typeof args?.filePath === "string"
                      ? args.filePath
                      : typeof args?.command === "string"
                        ? String(args.command).slice(0, 60)
                        : typeof args?.pattern === "string"
                          ? String(args.pattern)
                          : undefined
                toolCalls.push({
                  toolName: item.name,
                  summary,
                })
              }
            }
          } else if (msg.role === "toolResult") {
            if (msg.diff) {
              const filePath =
                msg.diff.fileName ||
                toolCalls.find((tc) => tc.toolName === msg.toolName)?.summary ||
                "Modified file"
              diffs.push({
                filePath,
                diff: msg.diff,
                toolName: msg.toolName,
              })
            }
          }
        } catch {
          // 忽略损坏 payload
        }
      }
    }

    const undoMessage: UndoSummaryMessage = {
      role: "undoSummary",
      timestamp: Date.now(),
      undoPayload: {
        userPrompt,
        files: userFiles,
        assistantSnippet,
        modelName: assistantModel,
        turnDurationMs,
        diffs,
        toolCalls,
        toolCallCount: toolCalls.length,
        fileChangeCount: diffs.length,
        undoneAt: Date.now(),
      },
    }

    const now = new Date().toISOString()
    let shouldDeleteSession = false
    agentSessionService.transaction(() => {
      agentSessionService.deleteCallsByEntryIds(turnEntryIds)
      agentSessionService.deleteEntries(turnEntryIds)
      agentSessionService.deleteSnapshotsByUserTimestamp(sessionId, userMessageTimestamp)

      // 插入撤销记录 entry，保证在 restoreSession 时能重建并展示
      agentSessionService.insertEntry({
        externalId: createExternalId(),
        sessionId,
        seq: agentSessionService.nextSeq(sessionId),
        parentId: null,
        type: "message",
        payload: JSON.stringify(undoMessage),
        createdAt: now,
      })

      const remainingEntries = agentSessionService.listEntries(sessionId)
      const hasMeaningfulMessages = remainingEntries.some((entry) => {
        if (entry.type === "message") {
          try {
            const parsed = JSON.parse(entry.payload) as AgentMessage
            return parsed.role !== "undoSummary"
          } catch {
            return true
          }
        }
        if (entry.type === "model_change") {
          try {
            const parsed = JSON.parse(entry.payload) as ModelSwitchMessage
            return !parsed.isInitial
          } catch {
            return false
          }
        }
        return false
      })

      if (!hasMeaningfulMessages) {
        shouldDeleteSession = true
      } else {
        agentSessionService.touchSession(sessionId, now)
      }
    })

    if (shouldDeleteSession) {
      this.deleteSession(sessionId)
    } else if (runner && runner.currentSessionId === sessionId) {
      runner.getTurnStore().restoreMessages(sessionId)
      runner.getTurnStore().loadTodo(runner.getTurnStore().readLastTodoEntry(sessionId))
      runner.emitEvent({ type: "todo_updated", todos: runner.getTurnStore().getTodo() })
    }
  }

  public renameSession(sessionId: string, title: string): void {
    if (!agentSessionService.getSession(sessionId)) return
    agentSessionService.renameSession(sessionId, title, new Date().toISOString())
  }

  public forkSession(sessionId: string, userMessageTimestamp?: number): AgentForkResult {
    const activeRunner = this.getRunner(sessionId)
    if (activeRunner?.isBusy()) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
    if (!agentSessionService.getSession(sessionId)) {
      return { ok: false, error: "会话不存在。" }
    }

    let forkSeq: number | undefined
    if (userMessageTimestamp !== undefined) {
      const forkEntry = agentSessionService.listMessageEntries(sessionId).find((entry) => {
        try {
          const message = JSON.parse(entry.payload) as AgentMessage
          return message.role === "user" && message.timestamp === userMessageTimestamp
        } catch {
          return false
        }
      })
      if (!forkEntry) {
        return { ok: false, error: "未找到该轮用户消息。" }
      }
      forkSeq = forkEntry.seq
      let boundary = activeRunner?.getCompactor().readBoundary(sessionId)
      if (!boundary) {
        const compactionEntry = agentSessionService
          .listEntries(sessionId)
          .filter((e) => e.type === "compaction")
          .pop()
        if (compactionEntry) {
          try {
            boundary = JSON.parse(compactionEntry.payload)
          } catch {
            // ignore
          }
        }
      }
      if (boundary && forkSeq < boundary.firstKeptSeq) {
        return {
          ok: false,
          error: "该轮位于已压缩区域，无法从此分支。请选择压缩摘要之后的消息。",
        }
      }
    }
    const result = agentSessionService.forkSession(sessionId, forkSeq)
    if (!result.ok) return result
    return { ok: true, sessionId: result.session.id }
  }

  public switchWorktree(
    path: string,
    sessionId?: string,
    tabId?: string,
  ): AgentSwitchWorktreeResult {
    const runner = this.getOrCreateRunner(sessionId, tabId)
    return runner.switchWorktree(path)
  }

  public switchProject(
    projectId: string,
    path: string,
    sessionId?: string,
    tabId?: string,
  ): AgentSwitchProjectResult {
    const runner = this.getOrCreateRunner(sessionId, tabId)
    return runner.switchProject(projectId, path)
  }

  public switchModel(
    selection: ModelSelection,
    sessionId?: string,
    tabId?: string,
  ): { ok: true; message?: ModelSwitchMessage } | { ok: false; error: string } {
    const runner = this.getOrCreateRunner(sessionId, tabId)
    return runner.switchModel(selection)
  }

  public setCollaborationMode(
    mode: CollaborationMode,
    sessionId?: string,
    tabId?: string,
  ): { ok: true } {
    const runner = this.getOrCreateRunner(sessionId, tabId)
    return runner.setCollaborationMode(mode)
  }

  public deleteSession(sessionId: string): void {
    const key = `sess:${sessionId}`
    const runner = this.runners.get(key)
    if (runner) {
      runner.cleanUp()
      this.runners.delete(key)
      if (runner.tabId) {
        this.runners.delete(`tab:${runner.tabId}`)
      }
    }

    agentSessionService.deleteSession(sessionId)
    spillManager.cleanSessionSpill(sessionId)
    jobRegistry.cleanSessionJobs(sessionId)
    this.eventSink?.({ type: "todo_updated", todos: [] })

    try {
      const sessionDir = join(getAppDataRoot(), "session", sessionId)
      if (existsSync(sessionDir)) {
        rmSync(sessionDir, { recursive: true, force: true })
      }
    } catch (err) {
      console.error(`Failed to delete session attachments directory for session: ${sessionId}`, err)
    }
  }

  public getCurrentCwd(sessionId?: string, tabId?: string): string | undefined {
    const runner = this.getRunner(sessionId, tabId)
    return runner?.getEffectiveCwd()
  }

  public getContextUsage(
    selection?: ModelSelection,
    sessionId?: string,
    tabId?: string,
  ): AgentContextUsage {
    const runner = this.getOrCreateRunner(sessionId, tabId)
    return runner.getContextUsage(selection)
  }

  public compact(sessionId?: string, tabId?: string): Promise<AgentCompactResult> {
    const runner = this.getRunner(sessionId, tabId)
    if (!runner) return Promise.resolve({ ok: false, error: "未找到会话实例" })
    return runner.compact()
  }

  public undoCompaction(sessionId?: string, tabId?: string): Promise<AgentUndoCompactionResult> {
    const runner = this.getRunner(sessionId, tabId)
    if (!runner) return Promise.resolve({ ok: false, error: "未找到会话实例" })
    return runner.undoCompaction()
  }

  public async getPromptAssembly(
    sessionId?: string,
    cwd?: string,
    tabId?: string,
  ): Promise<PromptAssembly> {
    const runner = this.getOrCreateRunner(sessionId, tabId)
    return runner.getPromptAssembly(cwd)
  }

  public async exportSession(options: ExportSessionOptions): Promise<ExportSessionResult> {
    const targetSessionId = options.sessionId
    let restoredSession: AgentRestoredSession
    let summary: AgentSessionSummary

    if (targetSessionId) {
      const sessionSummary = agentSessionService.getSession(targetSessionId)
      if (!sessionSummary) {
        return { ok: false, error: `会话不存在: ${targetSessionId}` }
      }
      summary = {
        id: sessionSummary.external_id,
        title: sessionSummary.title,
        cwd: sessionSummary.cwd,
        projectId: sessionSummary.project_id ?? null,
        createdAt: sessionSummary.created_at,
        updatedAt: sessionSummary.updated_at,
      }
      restoredSession = await this.restoreSession(targetSessionId)
    } else {
      const runner = this.getRunner()
      const messages = runner?.getMessages() ?? []
      if (messages.length === 0) {
        return { ok: false, error: "当前会话暂无消息可导出" }
      }
      summary = {
        id: "in-memory",
        title: "未命名会话",
        cwd: runner?.getEffectiveCwd() ?? "",
        projectId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      restoredSession = {
        messages,
        activeCapabilities: { tools: [], mcp: [], skills: [] },
        todos: [],
      }
    }

    if (restoredSession.messages.length === 0) {
      return { ok: false, error: "会话内容为空，无法导出" }
    }

    try {
      return await exportSessionToFile(restoredSession, summary, options)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "导出失败" }
    }
  }

  public async copySession(options?: CopySessionOptions): Promise<CopySessionResult> {
    const targetSessionId = options?.sessionId
    let restoredSession: AgentRestoredSession
    let summary: AgentSessionSummary | undefined

    if (targetSessionId) {
      const sessionSummary = agentSessionService.getSession(targetSessionId)
      if (sessionSummary) {
        summary = {
          id: sessionSummary.external_id,
          title: sessionSummary.title,
          cwd: sessionSummary.cwd,
          projectId: sessionSummary.project_id ?? null,
          createdAt: sessionSummary.created_at,
          updatedAt: sessionSummary.updated_at,
        }
      }
      restoredSession = await this.restoreSession(targetSessionId)
    } else {
      const runner = this.getRunner()
      const messages = runner?.getMessages() ?? []
      restoredSession = {
        messages,
        activeCapabilities: { tools: [], mcp: [], skills: [] },
        todos: [],
      }
    }

    if (restoredSession.messages.length === 0) {
      return { ok: false, error: "暂无内容可复制" }
    }

    try {
      const text = copySessionText(restoredSession, options, summary)
      return { ok: true, text }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "复制失败" }
    }
  }

  public listJobs(sessionId?: string): JobSnapshot[] {
    if (!sessionId) {
      const runner = this.getRunner()
      sessionId = runner?.getCurrentSessionId() ?? undefined
    }
    if (!sessionId) return []
    return jobRegistry.listJobs(sessionId)
  }

  public async killJob(
    jobId: JobId,
    reason?: string,
  ): Promise<{ ok: boolean; status?: JobStatus; error?: string }> {
    return jobRegistry.killJob(jobId, reason)
  }

  public async removeJob(jobId: JobId): Promise<{ ok: boolean; error?: string }> {
    return jobRegistry.removeJob(jobId)
  }

  public clearSettledJobs(sessionId?: string): { count: number } {
    if (!sessionId) {
      const runner = this.getRunner()
      sessionId = runner?.getCurrentSessionId() ?? undefined
    }
    if (!sessionId) return { count: 0 }
    return jobRegistry.clearSettledJobs(sessionId)
  }

  public async readJobOutput(
    jobId: JobId,
    wait?: boolean,
    timeoutMs?: number,
    mode: "delta" | "full" = "full",
  ): Promise<JobReadResult | null> {
    return jobRegistry.readOutput(jobId, wait, timeoutMs, undefined, mode)
  }
}

// 导出单例管理器实例
export const agentRunner = new SessionRunnerManager()
