import type { PromptAssembly } from "@shared/contracts/agent"
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { buildExecutionSteps, reuseExecutionSteps } from "@/features/agent/executionFlow"
import type { ChatMessage, ExecutionStep } from "@/features/agent/types"
import type { FilterKind, FlowRenderElement } from "../types"

type UseFlowStepsOptions = {
  messages: readonly ChatMessage[]
  promptAssembly: PromptAssembly | null
  isStreaming: boolean
  activeFilter: FilterKind
}

type UseFlowStepsResult = {
  steps: ExecutionStep[]
  maxTurn: number
  filteredSteps: ExecutionStep[]
  renderedFlowElements: FlowRenderElement[]
  hasNonGroupableAfterByIndex: boolean[]
  maxUserTurnIndex: number
  isStepExpanded: (step: ExecutionStep) => boolean
  toggleStepExpanded: (step: ExecutionStep) => void
  toggleGroupExpanded: (groupId: string) => void
  isGroupExpanded: (groupId: string) => boolean
}

/**
 * 执行步骤派生与展开状态：步骤构建复用、默认展开规则与手动覆盖、筛选与聚合渲染元素。
 */
export const useFlowSteps = ({
  messages,
  promptAssembly,
  isStreaming,
  activeFilter,
}: UseFlowStepsOptions): UseFlowStepsResult => {
  // 手动展开/折叠覆盖状态字典：用户手动点击过的步骤或 Group 在此记录覆盖值
  const [userExpansionOverrides, setUserExpansionOverrides] = useState<Record<string, boolean>>({})
  const [groupExpansionOverrides, setGroupExpansionOverrides] = useState<Record<string, boolean>>(
    {},
  )
  const pendingQuestionStepIdsRef = useRef(new Set<string>())

  // 提取步骤列表：直接由实时 messages 响应式计算，AI 生成输出中实时跟进新步骤与流式内容。
  // reuseExecutionSteps 稳定未变化步骤的对象引用，使子项 memo 只命中真正变化的步骤。
  const prevStepsRef = useRef<ExecutionStep[]>([])
  const steps = useMemo(() => {
    const next = reuseExecutionSteps(
      buildExecutionSteps(messages, promptAssembly),
      prevStepsRef.current,
    )
    prevStepsRef.current = next
    return next
  }, [messages, promptAssembly])

  // 计算最大轮次（最后一轮）
  const maxTurn = useMemo(() => {
    let max = 0
    for (const step of steps) {
      if (step.turnIndex > max) {
        max = step.turnIndex
      }
    }
    return max
  }, [steps])

  // 每个已完成 turn 的最后一个合格步骤 ID 集合（排除 modelSwitch / compaction / undo）。
  // 这些收尾步骤默认展开；turn 完成后即使再发送新消息也保持展开，不再自动折叠。
  const lastStepIdsOfCompletedTurns = useMemo(() => {
    const ids = new Set<string>()
    const seenTurns = new Set<number>()
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i]
      if (step.turnIndex <= 0 || seenTurns.has(step.turnIndex)) continue
      if (step.kind === "modelSwitch" || step.kind === "compaction" || step.kind === "undo") {
        continue
      }
      seenTurns.add(step.turnIndex)
      if (step.turnIndex < maxTurn || !isStreaming) {
        ids.add(step.id)
      }
    }
    return ids
  }, [steps, maxTurn, isStreaming])

  // 计算某个步骤当前的展开状态（用户手动覆盖 > 默认展开规则）
  const isStepExpanded = useCallback(
    (step: ExecutionStep): boolean => {
      if (step.id in userExpansionOverrides) {
        return userExpansionOverrides[step.id]
      }
      if (step.toolContent?.toolName === "question") {
        return step.toolContent.question !== undefined
      }
      // 默认规则：全部用户 item 默认展开；异常/中断 item 默认展开；方案卡片 proposedPlan 默认展开；审查卡片 reviewFindings 默认展开；todowrite 工具默认展开；每个已完成 turn 的最后一个 step 默认展开；其余全部折叠
      if (
        step.kind === "user" ||
        step.kind === "error" ||
        step.kind === "proposedPlan" ||
        step.kind === "reviewFindings" ||
        step.kind === "frontDesign" ||
        step.toolContent?.toolName === "todowrite"
      ) {
        return true
      }
      if (lastStepIdsOfCompletedTurns.has(step.id)) {
        return true
      }
      return false
    },
    [userExpansionOverrides, lastStepIdsOfCompletedTurns],
  )

  // question 完成后清除其手动展开覆盖，恢复完成态默认折叠；历史 question 仍可由用户再次展开查看。
  useLayoutEffect(() => {
    const pendingQuestionStepIds = new Set(
      steps
        .filter((step) => step.toolContent?.toolName === "question" && step.toolContent.question)
        .map((step) => step.id),
    )

    setUserExpansionOverrides((prev) => {
      let next: Record<string, boolean> | undefined
      for (const id of pendingQuestionStepIdsRef.current) {
        if (!pendingQuestionStepIds.has(id) && id in prev) {
          next ??= { ...prev }
          delete next[id]
        }
      }
      return next ?? prev
    })
    pendingQuestionStepIdsRef.current = pendingQuestionStepIds
  }, [steps])

  // 切换指定步骤的展开/折叠状态并记录手动覆盖
  const toggleStepExpanded = useCallback(
    (step: ExecutionStep) => {
      const currentExpanded = isStepExpanded(step)
      setUserExpansionOverrides((prev) => ({
        ...prev,
        [step.id]: !currentExpanded,
      }))
    },
    [isStepExpanded],
  )

  // 切换 Group 展开/折叠状态
  const toggleGroupExpanded = useCallback((groupId: string) => {
    setGroupExpansionOverrides((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }))
  }, [])

  // 判断 step 是否属于可折叠进 group 的类别（检索工具/其他工具/思考/系统；排除 ai、用户输入、压缩、子代理 subagent、proposedPlan、todo、question 以及写操作 edit/write/apply_patch）
  const isGroupableStep = useCallback((step: ExecutionStep): boolean => {
    if (
      step.kind === "assistant" ||
      step.kind === "user" ||
      step.kind === "compaction" ||
      step.kind === "modelSwitch" ||
      step.kind === "hook" ||
      step.kind === "error" ||
      step.kind === "subagent" ||
      step.kind === "proposedPlan" ||
      step.kind === "reviewFindings" ||
      step.kind === "frontDesign"
    ) {
      return false
    }
    const toolName = step.toolContent?.toolName
    if (
      toolName === "task" ||
      toolName === "todowrite" ||
      toolName === "question" ||
      toolName === "write" ||
      toolName === "edit" ||
      toolName === "apply_patch"
    ) {
      return false
    }
    return true
  }, [])

  // 过滤后的步骤列表
  const filteredSteps = useMemo(() => {
    if (activeFilter === "all") return steps
    if (activeFilter === "calls") {
      return steps.filter((step) => step.kind === "tool" || step.kind === "subagent")
    }
    return steps.filter((step) => step.kind === activeFilter)
  }, [steps, activeFilter])

  // 按轮次与非聚合项将 filteredSteps 切分为 items / groups
  const renderedFlowElements = useMemo(() => {
    if (activeFilter !== "all") {
      return filteredSteps.map((step) => ({
        kind: "single" as const,
        step,
      }))
    }

    type RenderElement =
      | { kind: "single"; step: ExecutionStep }
      | { kind: "group"; groupId: string; steps: ExecutionStep[]; turnIndex: number }

    const elements: RenderElement[] = []
    let currentGroupSteps: ExecutionStep[] = []
    let currentGroupTurn: number = -1

    const flushGroup = () => {
      if (currentGroupSteps.length === 0) return
      if (currentGroupSteps.length === 1) {
        elements.push({ kind: "single", step: currentGroupSteps[0] })
      } else {
        const groupId = `flow-group-${currentGroupSteps[0].id}`
        elements.push({
          kind: "group",
          groupId,
          steps: [...currentGroupSteps],
          turnIndex: currentGroupTurn,
        })
      }
      currentGroupSteps = []
      currentGroupTurn = -1
    }

    for (const step of filteredSteps) {
      if (isGroupableStep(step)) {
        if (currentGroupSteps.length > 0 && currentGroupTurn !== step.turnIndex) {
          flushGroup()
        }
        currentGroupTurn = step.turnIndex
        currentGroupSteps.push(step)
      } else {
        flushGroup()
        elements.push({ kind: "single", step })
      }
    }
    flushGroup()

    return elements
  }, [filteredSteps, activeFilter, isGroupableStep])

  // 每个元素之后是否还有"不可聚合的 single 元素"：一次反向扫描预计算，替代渲染期内 slice().some() 的 O(n²)。
  const hasNonGroupableAfterByIndex = useMemo(() => {
    const flags = new Array<boolean>(renderedFlowElements.length)
    let seen = false
    for (let index = renderedFlowElements.length - 1; index >= 0; index--) {
      flags[index] = seen
      const element = renderedFlowElements[index]
      if (element.kind === "single" && !isGroupableStep(element.step)) seen = true
    }
    return flags
  }, [renderedFlowElements, isGroupableStep])

  // 含用户步骤的最大轮次：用于判断某步骤之后是否仍有用户消息，替代逐元素全量扫描。
  const maxUserTurnIndex = useMemo(() => {
    let max = -1
    for (const step of steps) {
      if (step.kind === "user" && step.turnIndex > max) max = step.turnIndex
    }
    return max
  }, [steps])

  // Group 展开状态（默认折叠，仅手动展开后为 true）
  const isGroupExpanded = useCallback(
    (groupId: string): boolean => Boolean(groupExpansionOverrides[groupId]),
    [groupExpansionOverrides],
  )

  return {
    steps,
    maxTurn,
    filteredSteps,
    renderedFlowElements,
    hasNonGroupableAfterByIndex,
    maxUserTurnIndex,
    isStepExpanded,
    toggleStepExpanded,
    toggleGroupExpanded,
    isGroupExpanded,
  }
}
