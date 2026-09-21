import { useMemo } from "react"
import { isMcpToolCall } from "@/features/agent/components/AgentMessageList/AgentMessageItem/utils"
import type { ExecutionStep } from "@/features/agent/types"
import { type ExecutionFlowStats, type FilterKind, isWebSearchTool, type TurnStats } from "../types"

type UseFlowStatsOptions = {
  steps: ExecutionStep[]
  isStreaming: boolean
  maxTurn: number
}

type UseFlowStatsResult = {
  turnStatsMap: Map<number, TurnStats>
  turnMessageIdMap: Map<number, string>
  runningTurnSet: Set<number>
  stats: ExecutionFlowStats
  filterCounts: Record<FilterKind, number>
}

/**
 * 执行流程统计派生：每轮指标汇总、可删除轮次映射、运行中轮次集合、全局统计与筛选计数。
 */
export const useFlowStats = ({
  steps,
  isStreaming,
  maxTurn,
}: UseFlowStatsOptions): UseFlowStatsResult => {
  // 每轮执行指标汇总（计算每轮的模型、工具数、token、缓存命中、耗时及是否已完成）
  const turnStatsMap = useMemo<Map<number, TurnStats>>(() => {
    const map = new Map<
      number,
      TurnStats & {
        firstTimestamp?: number
        lastTimestamp?: number
        lastStepDurationMs?: number
        sumStepDurationMs: number
      }
    >()

    for (const step of steps) {
      if (step.turnIndex <= 0) continue

      let current = map.get(step.turnIndex)
      if (!current) {
        current = {
          turn: step.turnIndex,
          model: step.model,
          toolCallsCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
          durationMs: 0,
          isCompleted: true,
          sumStepDurationMs: 0,
        }
        map.set(step.turnIndex, current)
      }

      if (step.model && !current.model) {
        current.model = step.model
      }

      if (step.assistantContent?.variant && !current.variant) {
        current.variant = step.assistantContent.variant
      }

      if (step.status === "running") {
        current.isCompleted = false
      }

      if (step.kind === "tool" || step.kind === "subagent") {
        current.toolCallsCount++
      }

      if (step.durationMs !== undefined) {
        current.sumStepDurationMs += step.durationMs
      }

      if (step.timestamp !== undefined) {
        if (current.firstTimestamp === undefined) {
          current.firstTimestamp = step.timestamp
        }
        current.lastTimestamp = step.timestamp
        current.lastStepDurationMs = step.durationMs
      }

      if (step.kind !== "compaction" && step.tokens) {
        if (step.tokens.input) current.inputTokens += step.tokens.input
        if (step.tokens.output) current.outputTokens += step.tokens.output
        if (step.tokens.cacheRead) current.cacheReadTokens += step.tokens.cacheRead
        if (step.tokens.total) current.totalTokens += step.tokens.total
      }

      if (step.parentTokens) {
        if (step.parentTokens.input) current.inputTokens += step.parentTokens.input
        if (step.parentTokens.output) current.outputTokens += step.parentTokens.output
        if (step.parentTokens.cacheRead) current.cacheReadTokens += step.parentTokens.cacheRead
        if (step.parentTokens.total) current.totalTokens += step.parentTokens.total
      }
    }

    // 计算每个 turn 的端到端真实运行时间（优先基于首尾时间戳跨度计算）
    for (const current of map.values()) {
      if (
        current.firstTimestamp !== undefined &&
        current.lastTimestamp !== undefined &&
        current.lastTimestamp >= current.firstTimestamp
      ) {
        const span =
          current.lastTimestamp -
          current.firstTimestamp +
          (current.lastStepDurationMs !== undefined && current.lastStepDurationMs > 0
            ? current.lastStepDurationMs
            : 0)
        current.durationMs = span > 0 ? span : current.sumStepDurationMs
      } else {
        current.durationMs = current.sumStepDurationMs
      }
    }

    // 若当前为最后一轮且 isStreaming 为 true，则最后一轮未完成
    if (isStreaming && maxTurn > 0) {
      const lastTurnStat = map.get(maxTurn)
      if (lastTurnStat) {
        lastTurnStat.isCompleted = false
      }
    }

    return map
  }, [steps, isStreaming, maxTurn])

  // 轮次对应的可删除 AI / 错误消息 ID 映射
  const turnMessageIdMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const step of steps) {
      if (
        step.turnIndex > 0 &&
        step.messageId &&
        (step.kind === "assistant" || step.kind === "error")
      ) {
        map.set(step.turnIndex, step.messageId)
      }
    }
    return map
  }, [steps])

  // 正在运行中的轮次集合
  const runningTurnSet = useMemo(() => {
    const set = new Set<number>()
    for (const step of steps) {
      if (step.status === "running") {
        set.add(step.turnIndex)
      }
    }
    return set
  }, [steps])

  // 统计指标汇总
  const stats = useMemo<ExecutionFlowStats>(() => {
    let inputTokens = 0
    let outputTokens = 0
    let cacheReadTokens = 0
    let totalTokens = 0
    let toolCallsCount = 0
    let turnsCount = 0

    for (const step of steps) {
      if (step.turnIndex > turnsCount) {
        turnsCount = step.turnIndex
      }
      if (step.kind === "tool" || step.kind === "subagent") {
        toolCallsCount++
      }
      if (step.tokens) {
        if (step.tokens.input) inputTokens += step.tokens.input
        if (step.tokens.output) outputTokens += step.tokens.output
        if (step.tokens.cacheRead) cacheReadTokens += step.tokens.cacheRead
        if (step.tokens.total) totalTokens += step.tokens.total
      }
      if (step.parentTokens) {
        if (step.parentTokens.input) inputTokens += step.parentTokens.input
        if (step.parentTokens.output) outputTokens += step.parentTokens.output
        if (step.parentTokens.cacheRead) cacheReadTokens += step.parentTokens.cacheRead
        if (step.parentTokens.total) totalTokens += step.parentTokens.total
      }
    }

    return {
      turnsCount,
      totalSteps: steps.length,
      toolCallsCount,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      totalTokens,
    }
  }, [steps])

  // 各类型步骤计数
  const filterCounts = useMemo<Record<FilterKind, number>>(() => {
    const counts: Record<FilterKind, number> = {
      all: steps.length,
      calls: 0,
      system: 0,
      user: 0,
      thinking: 0,
      tool: 0,
      mcp: 0,
      webSearch: 0,
      subagent: 0,
      compaction: 0,
      undo: 0,
      assistant: 0,
      modelSwitch: 0,
      hook: 0,
      proposedPlan: 0,
      reviewFindings: 0,
      frontDesign: 0,
      error: 0,
    }
    for (const step of steps) {
      if (step.kind === "tool") {
        const toolName = step.toolContent?.toolName || step.title
        if (isWebSearchTool(toolName)) {
          counts.webSearch++
        } else if (isMcpToolCall(toolName)) {
          counts.mcp++
        } else {
          counts.tool++
        }
        counts.calls++
      } else {
        counts[step.kind]++
        if (step.kind === "subagent") {
          counts.calls++
        }
      }
    }
    return counts
  }, [steps])

  return { turnStatsMap, turnMessageIdMap, runningTurnSet, stats, filterCounts }
}
