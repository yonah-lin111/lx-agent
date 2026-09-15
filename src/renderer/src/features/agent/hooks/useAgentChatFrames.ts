import type { AgentMessage } from "@shared/contracts/agent"
import { useCallback, useRef } from "react"
import {
  cancelFrame,
  requestFrame,
  type ToolCallPatch,
} from "@/features/agent/hooks/agentChatStreamUtils"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import type { AgentChatCore } from "@/features/agent/hooks/useAgentChat.types"
import { extractSubagentData, extractToolProgressText, toChatMessage } from "@/features/agent/utils"

/**
 * 流式事件按帧合并（latest-wins）：
 * message_update / tool_execution_update 在高速流式下可达每秒上百次；每个事件只暂存最新快照，
 * 每个动画帧最多提交一次 React 状态更新，避免每 token 触发一次整树重渲染。
 */
export const useAgentChatFrames = ({
  core,
}: {
  core: Pick<AgentChatCore, "setMessages" | "streamingRef" | "currentSessionIdRef">
}) => {
  const { setMessages, streamingRef, currentSessionIdRef } = core
  const pendingMessageUpdateRef = useRef<AgentMessage | null>(null)
  const pendingToolUpdatesRef = useRef(new Map<string, unknown>())
  const flushFrameRef = useRef<number | null>(null)

  // 按 toolCallId 批量打补丁：仅重建命中块所在的消息，未命中消息保持原引用（击穿下游 memo 的成本在此归零）。
  const patchToolCallBlocks = useCallback((patches: Map<string, ToolCallPatch>) => {
    if (patches.size === 0) return
    setMessages((prev) => {
      let changed = false
      const next = prev.map((message) => {
        let messageChanged = false
        const blocks = message.blocks.map((block) => {
          if (block.kind !== "toolCall") return block
          const patch = patches.get(block.toolCallId)
          if (!patch) return block
          messageChanged = true
          return { ...block, ...patch }
        })
        if (!messageChanged) return message
        changed = true
        return { ...message, blocks }
      })
      return changed ? next : prev
    })
  }, [])

  // 按 toolCallId 更新消息内工具块状态。
  const updateToolStatus = useCallback(
    (toolCallId: string, status: "running" | "done" | "error") => {
      patchToolCallBlocks(new Map([[toolCallId, { status }]]))
    },
    [patchToolCallBlocks],
  )

  // 提交挂起快照：助手消息整体替换（仅流式条目换引用），工具进度按 toolCallId 定点打补丁。
  const commitPendingStreamUpdates = useCallback((): void => {
    const pendingMessage = pendingMessageUpdateRef.current
    const pendingTools = pendingToolUpdatesRef.current
    pendingMessageUpdateRef.current = null
    if (pendingTools.size > 0) {
      pendingToolUpdatesRef.current = new Map()
    }

    if (pendingMessage) {
      const streaming = streamingRef.current
      if (streaming) {
        const updated = toChatMessage(
          pendingMessage,
          true,
          streaming.id,
          currentSessionIdRef.current,
        )
        updated.isStreaming = true
        streamingRef.current = updated
        setMessages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))

        // 在流式输出过程中，如果包含前端设计卡片，实时同步到 frontDesignStore
        updated.blocks.forEach((block) => {
          if (block.kind === "frontDesign" && !block.design.isUpdate) {
            frontDesignStore.registerDesign({
              id: block.design.id,
              parentId: block.design.parentId,
              title: block.design.title,
              html: block.design.html,
              isStreaming: true,
              autoActivate: true,
              sessionId: currentSessionIdRef.current,
              updatedAt: updated.timestamp,
              mode: block.design.mode,
              designDir: block.design.designDir,
            })
          }
        })
      }
    }

    if (pendingTools.size > 0) {
      const patches = new Map<string, ToolCallPatch>()
      for (const [toolCallId, partialResult] of pendingTools) {
        const progress = extractToolProgressText(partialResult)
        const subagent = extractSubagentData(partialResult)
        if (progress === undefined && subagent === undefined) continue
        patches.set(toolCallId, {
          ...(progress !== undefined ? { progress } : {}),
          ...(subagent !== undefined ? { subagent } : {}),
        })
      }
      patchToolCallBlocks(patches)
    }
  }, [patchToolCallBlocks])

  // 请求下一帧提交（同一帧内的多次更新只提交一次）。
  const requestStreamFlush = useCallback((): void => {
    if (flushFrameRef.current !== null) return
    flushFrameRef.current = requestFrame(() => {
      flushFrameRef.current = null
      commitPendingStreamUpdates()
    })
  }, [commitPendingStreamUpdates])

  // 丢弃挂起快照（流终止/新流接管/卸载时调用）。
  const discardPendingStreamUpdates = useCallback((): void => {
    if (flushFrameRef.current !== null) {
      cancelFrame(flushFrameRef.current)
      flushFrameRef.current = null
    }
    pendingMessageUpdateRef.current = null
    pendingToolUpdatesRef.current = new Map()
  }, [])

  return {
    patchToolCallBlocks,
    updateToolStatus,
    commitPendingStreamUpdates,
    requestStreamFlush,
    discardPendingStreamUpdates,
    flushFrameRef,
    pendingMessageUpdateRef,
    pendingToolUpdatesRef,
  }
}
