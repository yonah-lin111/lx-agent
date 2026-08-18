import type { SuggestedQuestionContextMessage } from "@shared/contracts/agent"
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  GitBranch,
  Locate,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { AgentCompactionSummary } from "@/features/agent/components/AgentCompactionSummary"
import {
  AgentExecutionGroup,
  type ExecutionGroupItem,
} from "@/features/agent/components/AgentExecutionGroup"
import { AgentMcpCallBlock } from "@/features/agent/components/AgentMcpCallBlock"
import { AgentMessageFiles } from "@/features/agent/components/AgentMessageFiles"
import { AgentQuestionBlock } from "@/features/agent/components/AgentQuestionBlock"
import { AgentSkillCallBlock } from "@/features/agent/components/AgentSkillCallBlock"
import { AgentSubagentBlock } from "@/features/agent/components/AgentSubagentBlock"
import { AgentThinkingBlock } from "@/features/agent/components/AgentThinkingBlock"
import { AgentTodoCallBlock } from "@/features/agent/components/AgentTodoCallBlock"
import { AgentToolCallBlock } from "@/features/agent/components/AgentToolCallBlock"
import { AgentWebSearchBlock } from "@/features/agent/components/AgentWebSearchBlock"
import { SuggestedQuestions } from "@/features/agent/components/SuggestedQuestions"
import { TOOL_GROUP_SEPARATORS } from "@/features/agent/constants"
import { useSuggestedQuestions } from "@/features/agent/hooks/useSuggestedQuestions"
import type { ChatBlock, ChatMessage, LspToolDetails } from "@/features/agent/types"
import { sanitizeSelectionTrailingNewlines } from "@/lib/clipboard"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>
// 执行组内容块（普通工具调用、思考、MCP 与联网搜索调用）。
type ExecutionBlock = ToolCallBlock | Extract<ChatBlock, { kind: "thinking" }>
type ExecutionItem = { block: ExecutionBlock; isStreaming: boolean }
// 仅工具调用的执行条目（Skill 组）。
type ToolCallItem = { block: ToolCallBlock; isStreaming: boolean }
type ExecutionGroup = {
  kind: "execution"
  blocks: ExecutionItem[]
}
// Skill 调用组（连续调用合并）。
type SkillCallGroup = {
  kind: "skill"
  blocks: ToolCallItem[]
}
// 展示分组联合类型。
type DisplayGroup =
  | { kind: "text"; block: Extract<ChatBlock, { kind: "text" }>; isStreaming: boolean }
  | ExecutionGroup
  | SkillCallGroup
  // 写操作工具独立组（不参与执行折叠，展示 diff）。
  | { kind: "write"; block: ToolCallBlock; isStreaming: boolean }
  // 子代理调用独立组（不参与执行折叠）。
  | { kind: "subagent"; block: ToolCallBlock; isStreaming: boolean }
  // 任务清单调用独立组（不参与执行折叠，逐条展示清单）。
  | { kind: "todo"; block: ToolCallBlock; isStreaming: boolean }
  // 模型提问调用独立组（不参与执行折叠，内联作答）。
  | { kind: "question"; block: ToolCallBlock; isStreaming: boolean }

const SKILL_TOOL_NAME = "read_skill"
const WEB_SEARCH_TOOL_NAME = "web_search"
const SUBAGENT_TOOL_NAME = "task"
const TODO_TOOL_NAME = "todowrite"
const QUESTION_TOOL_NAME = "question"

// 稳定的空上下文（避免每次渲染新数组导致 hook effect 依赖变化触发无限重渲染）。
const EMPTY_SUGGESTED_QUESTION_CONTEXT: SuggestedQuestionContextMessage[] = []

// 判断是否为 Skill 调用。
const isSkillToolCall = (toolName: string): boolean => toolName === SKILL_TOOL_NAME

// 判断是否为联网搜索调用。
const isWebSearchToolCall = (toolName: string): boolean => toolName === WEB_SEARCH_TOOL_NAME

// 判断是否为子代理（task 工具）调用。
const isSubagentToolCall = (toolName: string): boolean => toolName === SUBAGENT_TOOL_NAME

// 判断是否为任务清单（todowrite 工具）调用。
const isTodoToolCall = (toolName: string): boolean => toolName === TODO_TOOL_NAME

// 判断是否为模型提问（question 工具）调用。
const isQuestionToolCall = (toolName: string): boolean => toolName === QUESTION_TOOL_NAME

// 判断是否为 MCP 调用（MCP 工具全名为 `server_tool`，内置工具名不含下划线）。
const isMcpToolCall = (toolName: string): boolean =>
  toolName !== SKILL_TOOL_NAME && !isWebSearchToolCall(toolName) && toolName.includes("_")

const getMcpServerName = (toolName: string): string => {
  const separatorIndex = toolName.indexOf("_")
  return separatorIndex > 0 ? toolName.slice(0, separatorIndex) : toolName
}

// 判断是否为写操作工具（文件修改，独立展示且不参与执行折叠）。
const isWriteToolCall = (toolName: string): boolean => toolName === "edit" || toolName === "write"

// token 千位紧凑缩写（英文 K/M）。
const formatTokensShort = (count: number): string => {
  if (count < 1000) return count.toString()
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`
  if (count < 1000000) return `${Math.round(count / 1000)}k`
  return `${(count / 1000000).toFixed(1)}M`
}

interface AgentMessageItemProps {
  message: ChatMessage
  continuationMessages?: ChatMessage[]
  isLoading?: boolean
  isPinned?: boolean
  isEditing?: boolean
  // 是否为当前最后一条 AI 回答（仅该条目展示建议问题）。
  isLastAssistant?: boolean
  // 生成建议问题所需的完整会话上下文。
  suggestedQuestionContext?: SuggestedQuestionContextMessage[]
  // 点击建议问题直接发送。
  onSendSuggestedQuestion?: (question: string) => void
  // 点击建议问题回显到输入框并聚焦。
  onEchoToInput?: (question: string) => void
  onStartEdit?: () => void
  onCancelEdit?: () => void
  onEdit?: (id: string, newContent: string) => void
  onDelete?: (messageId: string) => void
  // 点击"从此分支"：从该用户轮切割复制历史到新会话（assistant / toolResult 消息不显示）。
  onFork?: (userMessageTimestamp: number) => void
  // 吸顶状态下点击"定位"：滚动回该消息在自然流中的原始位置（消息顶对齐列表视口顶部）。
  onLocate?: () => void
  // 点击子代理 label 打开面板弹窗。
  onOpenSubagent?: (toolCall: ToolCallBlock) => void
  // 只读模式（子代理面板内渲染，隐藏编辑/删除操作，保留复制）。
  readOnly?: boolean
  // 回到底部按钮是否可见（可见时由按钮接管 loader，隐藏条目内 loading 效果）。
  showScrollToBottom?: boolean
  // "继续生成"可用（最后一条 AI 回答被截断/中止且未在流式）。
  canContinue?: boolean
  // 点击"继续生成"：续写被中断的上一轮输出。
  onContinue?: () => void
}

export const AgentMessageItem = ({
  message,
  continuationMessages = [],
  isLoading,
  isPinned = false,
  isEditing: isEditingProp,
  isLastAssistant = false,
  suggestedQuestionContext,
  onSendSuggestedQuestion,
  onEchoToInput,
  onStartEdit,
  onCancelEdit,
  onEdit,
  onDelete,
  onFork,
  onLocate,
  onOpenSubagent,
  readOnly = false,
  showScrollToBottom = false,
  canContinue = false,
  onContinue,
}: AgentMessageItemProps): React.JSX.Element => {
  const isUser = message.role === "user"
  // 用户消息时间戳（fork 定位切割轮；const 捕获便于闭包内保持收窄）。
  const messageTimestamp = message.timestamp
  // 子代理面板（readOnly）内气泡使用独立配色，与主消息列表区分。
  // 即时插话（steer）使用暖色暗调；项目/全局 Prompt 模板使用对应的项目/全局底色（纯色无边框）。
  const userBubbleClass = readOnly
    ? "bg-[#33517a]"
    : message.isSteer
      ? "bg-steer-bubble"
      : message.command?.kind === "prompt" && message.command.source === "project"
        ? "bg-[#163f35]"
        : message.command?.kind === "prompt" && message.command.source === "user"
          ? "bg-[#1e2a5e]"
          : message.command?.kind === "skill"
            ? "bg-[#35254d]"
            : "bg-user-bubble"
  const assistantBubbleClass = readOnly ? "bg-[#363e4c]" : "bg-[#303030]"
  const previewRef = useRef<HTMLDivElement>(null)
  const userContentRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isCollapsible, setIsCollapsible] = useState(false)
  const [isClamped, setIsClamped] = useState(false)
  const [localIsEditing, setLocalIsEditing] = useState(false)
  const isEditing = isEditingProp ?? localIsEditing
  const [editText, setEditText] = useState(
    message.blocks.find((block) => block.kind === "text")?.text ?? "",
  )
  // 吸顶时消息压缩为 1 行，吸顶移除后恢复默认 3 行。
  const clampLineCount = isPinned ? 1 : 3
  const clampLineClass = isPinned ? "line-clamp-1" : "line-clamp-3"

  // 吸顶居中所需的水平位移 =(容器宽 - 气泡宽)/ 2。flex 对齐不可动画，用 transform 表达，进入/退出双向都能过渡。
  const outerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [pinShift, setPinShift] = useState(0)
  const prevIsEditingRef = useRef(isEditing)
  const isInitialMountRef = useRef(true)
  const measurePinShift = useCallback((): void => {
    const outer = outerRef.current
    const content = contentRef.current
    if (!outer || !content) return
    if (isInitialMountRef.current) {
      content.style.transition = "none"
    }
    setPinShift(Math.max(0, (outer.clientWidth - content.clientWidth) / 2))
    if (isInitialMountRef.current) {
      requestAnimationFrame(() => {
        content.style.transition = ""
      })
      isInitialMountRef.current = false
    }
  }, [])

  // 钉住瞬间先同步测量一次避免首帧闪跳；尺寸变化由 ResizeObserver 兜底。
  useLayoutEffect(() => {
    if (isPinned) measurePinShift()
  }, [isPinned, measurePinShift])

  useEffect(() => {
    if (!isPinned) return
    const outer = outerRef.current
    const content = contentRef.current
    if (!outer || !content) return
    const observer = new ResizeObserver(measurePinShift)
    observer.observe(outer)
    observer.observe(content)
    return () => observer.disconnect()
  }, [isPinned, measurePinShift])

  // 编辑框(380px)与气泡(自适应)宽度不同，吸顶居中偏移不同；切换瞬间禁用过渡并同步重测，
  // 使编辑框/气泡各自居中，且打开/关闭编辑时不触发滑动偏移动画。
  useLayoutEffect(() => {
    if (!isPinned || prevIsEditingRef.current === isEditing) return
    prevIsEditingRef.current = isEditing
    const content = contentRef.current
    if (!content) return
    content.style.transition = "none"
    measurePinShift()
    const raf = requestAnimationFrame(() => {
      content.style.transition = ""
    })
    return () => cancelAnimationFrame(raf)
  }, [isEditing, isPinned, measurePinShift])

  const userText = useMemo(() => {
    const joined = message.blocks
      .filter((block) => block.kind === "text")
      .map((block) => block.text)
      .join("\n")
    // 防御：即使上游残留 /steer 前缀也剥离，保证气泡只展示内容、不出现命令。
    return message.isSteer ? joined.replace(/^\s*\/steer\s+/, "") : joined
  }, [message.blocks, message.isSteer])

  const commandTag = useMemo<{ label: string; sourceTag?: string } | null>(() => {
    if (message.isSteer) {
      return {
        label: "/steer",
        sourceTag: "Steer",
      }
    }
    if (message.command) {
      const name = message.command.name.startsWith("/")
        ? message.command.name
        : `/${message.command.name}`

      const sourceTag =
        message.command.kind === "prompt"
          ? message.command.source === "project"
            ? "Project"
            : "Global"
          : message.command.kind === "skill"
            ? "Skill"
            : undefined

      return {
        label: name,
        sourceTag,
      }
    }
    return null
  }, [message.isSteer, message.command])

  const displayBlocks = useMemo(
    () =>
      [message, ...continuationMessages].flatMap((currentMessage) =>
        currentMessage.blocks.map((block) => ({ block, isStreaming: currentMessage.isStreaming })),
      ),
    [continuationMessages, message],
  )
  // 本轮 QA 聚合 token 用量：message + continuationMessages 中所有 assistant 消息逐字段求和（底部指标展示）。
  const qaUsage = useMemo(() => {
    let input = 0
    let output = 0
    let cacheRead = 0
    let totalTokens = 0
    let hasUsage = false
    for (const currentMessage of [message, ...continuationMessages]) {
      if (currentMessage.role !== "assistant" || !currentMessage.usage) continue
      hasUsage = true
      input += currentMessage.usage.input
      output += currentMessage.usage.output
      cacheRead += currentMessage.usage.cacheRead ?? 0
      totalTokens += currentMessage.usage.totalTokens
    }
    if (!hasUsage) return null
    return { input, output, cacheRead, totalTokens }
  }, [message, continuationMessages])
  const diffByToolCallId = useMemo(
    () =>
      new Map(
        displayBlocks
          .filter(
            (
              item,
            ): item is {
              block: Extract<ChatBlock, { kind: "toolResult" }>
              isStreaming: boolean
            } => item.block.kind === "toolResult" && item.block.diff !== undefined,
          )
          .map((item) => [item.block.toolCallId, item.block.diff]),
      ),
    [displayBlocks],
  )
  // lsp 工具结果（details.lsp）按 toolCallId 索引，供合并组渲染跳转块。
  const lspDetailsByToolCallId = useMemo(
    () =>
      new Map(
        displayBlocks
          .filter(
            (
              item,
            ): item is {
              block: Extract<ChatBlock, { kind: "toolResult" }>
              isStreaming: boolean
            } => item.block.kind === "toolResult" && item.block.lsp !== undefined,
          )
          .map((item) => [item.block.toolCallId, item.block.lsp]),
      ),
    [displayBlocks],
  )
  // 按其他工具或思考切分连续的同名可合并工具调用（read/ls/grep/find/bash）。
  const mergeableToolCallGroups = useMemo(() => {
    const groups: ToolCallBlock[][] = []
    const mergeableToolCallIds = new Set<string>()

    for (const { block } of displayBlocks) {
      if (block.kind === "toolCall" && block.toolName in TOOL_GROUP_SEPARATORS) {
        mergeableToolCallIds.add(block.toolCallId)
        const lastGroup = groups.at(-1)
        if (lastGroup && lastGroup[0]?.toolName === block.toolName) {
          lastGroup.push(block)
        } else {
          groups.push([block])
        }
        continue
      }

      // 可合并工具的调用结果只属于前一组，不应打断连续归类。
      if (block.kind === "toolResult" && mergeableToolCallIds.has(block.toolCallId)) continue
      if (block.kind === "toolCall" || block.kind === "thinking" || block.kind === "text") {
        groups.push([])
      }
    }

    return groups.filter((group) => group.length > 0)
  }, [displayBlocks])
  const mergeableToolCallGroupById = useMemo(
    () =>
      new Map(
        mergeableToolCallGroups.flatMap((group) =>
          group.map((block) => [block.toolCallId, group] as const),
        ),
      ),
    [mergeableToolCallGroups],
  )
  // 按同服务名切分连续的 MCP 调用，供执行组内渲染 MCP 子块。
  const mcpCallGroups = useMemo(() => {
    const groups: ToolCallBlock[][] = []
    for (const { block } of displayBlocks) {
      // MCP 调用的结果只属于前一组，不应打断连续归类。
      if (block.kind === "toolResult" && isMcpToolCall(block.toolName)) continue
      if (block.kind !== "toolCall" || !isMcpToolCall(block.toolName)) {
        groups.push([])
        continue
      }
      const lastGroup = groups.at(-1)
      if (
        lastGroup?.[0] &&
        getMcpServerName(lastGroup[0].toolName) === getMcpServerName(block.toolName)
      ) {
        lastGroup.push(block)
      } else {
        groups.push([block])
      }
    }

    return groups.filter((group) => group.length > 0)
  }, [displayBlocks])
  const mcpCallGroupById = useMemo(
    () =>
      new Map(
        mcpCallGroups.flatMap((group) => group.map((block) => [block.toolCallId, group] as const)),
      ),
    [mcpCallGroups],
  )
  // 按连续调用切分 web_search 调用，供执行组内渲染 Web Search 子块。
  const webSearchCallGroups = useMemo(() => {
    const groups: ToolCallBlock[][] = []
    for (const { block } of displayBlocks) {
      // web_search 调用的结果只属于前一组，不应打断连续归类。
      if (block.kind === "toolResult" && isWebSearchToolCall(block.toolName)) continue
      if (block.kind !== "toolCall" || !isWebSearchToolCall(block.toolName)) {
        groups.push([])
        continue
      }
      const lastGroup = groups.at(-1)
      if (lastGroup?.[0] && lastGroup[0].toolName === block.toolName) {
        lastGroup.push(block)
      } else {
        groups.push([block])
      }
    }

    return groups.filter((group) => group.length > 0)
  }, [displayBlocks])
  const webSearchCallGroupById = useMemo(
    () =>
      new Map(
        webSearchCallGroups.flatMap((group) =>
          group.map((block) => [block.toolCallId, group] as const),
        ),
      ),
    [webSearchCallGroups],
  )
  const executionGroups = useMemo(() => {
    const groups: DisplayGroup[] = []
    let currentExecution: ExecutionGroup | null = null

    for (const item of displayBlocks) {
      if (item.block.kind === "text") {
        currentExecution = null
        groups.push({ kind: "text", block: item.block, isStreaming: item.isStreaming })
        continue
      }
      if (item.block.kind === "thinking") {
        if (!currentExecution) {
          currentExecution = { kind: "execution", blocks: [] }
          groups.push(currentExecution)
        }
        currentExecution.blocks.push({ block: item.block, isStreaming: item.isStreaming })
        continue
      }
      if (item.block.kind === "toolResult") continue
      if (item.block.kind !== "toolCall") continue

      const toolName = item.block.toolName
      if (isSkillToolCall(toolName)) {
        currentExecution = null
        const previousGroup = groups.at(-1)
        if (previousGroup?.kind === "skill") {
          previousGroup.blocks.push({ block: item.block, isStreaming: item.isStreaming })
        } else {
          groups.push({
            kind: "skill",
            blocks: [{ block: item.block, isStreaming: item.isStreaming }],
          })
        }
        continue
      }
      // 写操作工具独立成组：切断执行组并永不参与折叠，下方展示 diff。
      if (isWriteToolCall(toolName)) {
        currentExecution = null
        groups.push({ kind: "write", block: item.block, isStreaming: item.isStreaming })
        continue
      }
      // 子代理调用独立成组：切断执行组并永不参与折叠。
      if (isSubagentToolCall(toolName)) {
        currentExecution = null
        groups.push({ kind: "subagent", block: item.block, isStreaming: item.isStreaming })
        continue
      }
      // 任务清单调用独立成组：切断执行组并永不参与折叠，下方逐条展示清单。
      if (isTodoToolCall(toolName)) {
        currentExecution = null
        groups.push({ kind: "todo", block: item.block, isStreaming: item.isStreaming })
        continue
      }
      // 模型提问调用独立成组：切断执行组并永不参与折叠，下方内联作答。
      if (isQuestionToolCall(toolName)) {
        currentExecution = null
        groups.push({ kind: "question", block: item.block, isStreaming: item.isStreaming })
        continue
      }
      if (isWebSearchToolCall(toolName)) {
        if (!currentExecution) {
          currentExecution = { kind: "execution", blocks: [] }
          groups.push(currentExecution)
        }
        currentExecution.blocks.push({ block: item.block, isStreaming: item.isStreaming })
        continue
      }
      if (isMcpToolCall(toolName)) {
        if (!currentExecution) {
          currentExecution = { kind: "execution", blocks: [] }
          groups.push(currentExecution)
        }
        currentExecution.blocks.push({ block: item.block, isStreaming: item.isStreaming })
        continue
      }

      if (!currentExecution) {
        currentExecution = { kind: "execution", blocks: [] }
        groups.push(currentExecution)
      }
      currentExecution.blocks.push({
        block: item.block,
        isStreaming: item.isStreaming,
      })
    }

    return groups
  }, [displayBlocks])
  const assistantError = !isUser
    ? [message, ...continuationMessages].find((currentMessage) => currentMessage.error)?.error
    : undefined
  const isStreamingNow =
    message.isStreaming || continuationMessages.some((currentMessage) => currentMessage.isStreaming)
  const hasOutput = displayBlocks.some(
    ({ block }) => block.kind === "text" && block.text.trim() !== "",
  )
  // 底部操作按钮可展示的内容：文本输出、工具调用或思考（工具型回复也应有复制/用量按钮）。
  const hasActionableContent =
    hasOutput ||
    displayBlocks.some(({ block }) => block.kind === "toolCall" || block.kind === "thinking")
  // 消息是否被用户中止（停止按钮 / Esc 双击）；用于底部黄色"已取消生成"提示。
  const isAborted =
    !isUser &&
    [message, ...continuationMessages].some(
      (currentMessage) => currentMessage.stopReason === "aborted",
    )
  // 建议问题触发条件：最后一条 AI 回答 + 正常完成（非流式、无错误、有文本输出）；压缩摘要块不触发。
  const canSuggestSuggestedQuestions = Boolean(
    message.role !== "compactionSummary" &&
      !isUser &&
      isLastAssistant &&
      !isStreamingNow &&
      !isLoading &&
      !assistantError &&
      hasOutput &&
      suggestedQuestionContext &&
      suggestedQuestionContext.length > 0,
  )
  const {
    questions: suggestedQuestions,
    isLoading: isLoadingSuggestedQuestions,
    clear: clearSuggestedQuestions,
  } = useSuggestedQuestions({
    enabled: canSuggestSuggestedQuestions,
    isStreaming: isStreamingNow,
    isLastAssistant,
    context: suggestedQuestionContext ?? EMPTY_SUGGESTED_QUESTION_CONTEXT,
  })

  const handleSendSuggestedQuestion = (question: string): void => {
    clearSuggestedQuestions()
    onSendSuggestedQuestion?.(question)
  }

  // 回显不隐藏建议，方便连续回显（每次覆盖输入框）；发送消息后由"非最后一条"自然隐藏。
  const handleEchoSuggestedQuestion = (question: string): void => {
    onEchoToInput?.(question)
  }

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [isEditing])

  useEffect(() => {
    setEditText(userText)
  }, [userText])

  // 折叠测量：临时加 line-clamp-3 实测 3 行高度，避免解析 "normal" 行高（parseFloat → NaN → 20）带来的猜测误差。
  const measureCollapse = useCallback((): void => {
    const content = userContentRef.current
    if (!content) return

    // 临时移除 line-clamp 以准确测量完整高度
    const wasClamped =
      content.classList.contains("line-clamp-3") || content.classList.contains("line-clamp-1")
    if (wasClamped) {
      content.classList.remove("line-clamp-3")
      content.classList.remove("line-clamp-1")
    }

    // 显式 height 会覆盖 -webkit-line-clamp 的盒高（clientHeight 返回完整高度而非 3 行高度）。
    // 折叠动画/侧栏折叠期间 height 可能正处于中间值，不清空会量出 collapsedHeight == fullHeight 而误判不可折叠。
    const savedHeight = content.style.height
    content.style.height = ""

    content.classList.add(clampLineClass)
    const collapsedHeight = content.clientHeight
    content.classList.remove(clampLineClass)
    const fullHeight = content.scrollHeight
    content.style.height = savedHeight

    if (wasClamped && !isExpanded) {
      content.classList.add(clampLineClass)
    }

    if (fullHeight > collapsedHeight + 1) {
      setIsCollapsible(true)
      if (!isExpanded) {
        content.style.height = `${collapsedHeight}px`
        setIsClamped(true)
      }
    } else {
      setIsCollapsible(false)
      setIsClamped(false)
      content.style.height = ""
    }
  }, [isExpanded, isPinned])

  useLayoutEffect(() => {
    if (!isUser || isEditing) return
    measureCollapse()
  }, [isUser, isEditing, measureCollapse])

  // 窗口尺寸/字体等布局变更会改变换行行数，使折叠状态过期；仅在宽度变化时重测，避免折叠动画期间反复触发。
  useEffect(() => {
    if (!isUser || isEditing) return
    const content = userContentRef.current
    if (!content) return

    let lastWidth = content.clientWidth
    const observer = new ResizeObserver(() => {
      if (content.clientWidth === lastWidth) return
      lastWidth = content.clientWidth
      measureCollapse()
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [isUser, isEditing, measureCollapse])

  const toggleExpand = (): void => {
    const content = userContentRef.current
    if (!content) return

    const nextIsExpanded = !isExpanded
    if (nextIsExpanded) {
      // 展开：移除 line-clamp 并清空显式高度，直接展示完整内容。
      setIsClamped(false)
      content.style.height = ""
    } else {
      // 折叠：恢复行数截断高度并挂 line-clamp，无动画瞬时切换。
      const lineHeight = Number.parseFloat(window.getComputedStyle(content).lineHeight) || 20
      content.style.height = `${lineHeight * clampLineCount}px`
      setIsClamped(true)
    }
    setIsExpanded(nextIsExpanded)
  }

  // 双击/三击选中整条消息复制时，Chromium 会把选区结束处的块边界序列化为尾部换行，这里按内容原文还原。
  const handleBubbleCopy = (e: React.ClipboardEvent<HTMLDivElement>): void => {
    const content = userContentRef.current
    const selection = window.getSelection()
    if (!content || !selection || !e.clipboardData) return
    const cleaned = sanitizeSelectionTrailingNewlines(selection, content)
    if (cleaned === null) return
    e.preventDefault()
    e.clipboardData.setData("text/plain", cleaned)
  }

  const copyMessageContent = async (): Promise<void> => {
    try {
      const text = displayBlocks
        .map(({ block }) => {
          if (block.kind === "text" || block.kind === "thinking") return block.text
          if (block.kind === "toolResult") return block.text
          return ""
        })
        .filter(Boolean)
        .join("\n\n")
      await navigator.clipboard.writeText(text || assistantError || "")
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const handleStartEdit = (): void => {
    setEditText(userText)
    if (onStartEdit) {
      onStartEdit()
    } else {
      setLocalIsEditing(true)
    }
  }

  const handleSaveEdit = (): void => {
    const trimmed = editText.trim()
    if (!trimmed) return
    if (onEdit) {
      onEdit(message.id, trimmed)
    } else {
      message.blocks = message.blocks.map((block) =>
        block.kind === "text" ? { ...block, text: trimmed } : block,
      )
    }
    if (onCancelEdit) {
      onCancelEdit()
    } else {
      setLocalIsEditing(false)
    }
  }

  const handleCancelEdit = (): void => {
    setEditText(userText)
    if (onCancelEdit) {
      onCancelEdit()
    } else {
      setLocalIsEditing(false)
    }
  }

  // 上下文压缩摘要块：非交互（不可编辑/删除），诚实地标注"此处已压缩"；压缩中展示 loading 占位。
  if (message.role === "compactionSummary") {
    const summary = message.blocks.find((block) => block.kind === "text")?.text ?? ""
    return (
      <AgentCompactionSummary
        summary={summary}
        isLoading={message.isCompacting}
        isManual={message.isManual}
        modelName={message.model}
        usage={message.compactionUsage}
        summaryTokens={message.summaryTokens}
      />
    )
  }

  if (isUser) {
    return (
      <div ref={outerRef} className="group flex w-full flex-col items-end px-0">
        <div
          ref={contentRef}
          className="agent-pinned-shift flex w-fit max-w-[88%] flex-col items-end"
          style={{ transform: isPinned ? `translateX(-${pinShift}px)` : undefined }}
        >
          {isEditing ? (
            <div
              className={`flex w-[380px] max-w-full flex-col gap-2 rounded-[18px] rounded-br-[4px] ${userBubbleClass} px-3 py-2`}
            >
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    handleSaveEdit()
                  } else if (e.key === "Escape") {
                    handleCancelEdit()
                  }
                }}
                className="custom-scrollbar h-[100px] w-full resize-none overflow-y-auto bg-transparent text-[13px] leading-[20px] text-white/90 focus:outline-none"
              />
              <div className="flex items-center justify-end gap-1 pt-1">
                <LxIconButton
                  size="small"
                  aria-label="取消编辑"
                  title={{ content: "取消", placement: "top" }}
                  onClick={handleCancelEdit}
                >
                  <X className="h-3.5 w-3.5" />
                </LxIconButton>
                <LxIconButton
                  size="small"
                  aria-label="发送消息"
                  title={{ content: "发送消息 (Enter)", placement: "top" }}
                  disabled={!editText.trim() || editText.trim() === userText.trim()}
                  onClick={handleSaveEdit}
                >
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                </LxIconButton>
              </div>
            </div>
          ) : (
            <>
              {message.files && !isPinned && <AgentMessageFiles files={message.files} />}
              <div
                className={`w-fit max-w-full rounded-[18px] rounded-br-[4px] ${userBubbleClass} px-3 py-2 text-[13px] text-white/90 whitespace-pre-wrap break-words`}
                onCopy={handleBubbleCopy}
              >
                <div
                  ref={userContentRef}
                  className={
                    isClamped
                      ? `${clampLineClass} overflow-hidden`
                      : "custom-scrollbar max-h-[50vh] overflow-y-auto"
                  }
                >
                  {userText}
                </div>
              </div>
            </>
          )}
          {isEditing ? (
            <div className="mt-1 h-5" aria-hidden="true" />
          ) : (
            <div
              className={`mt-1 flex w-full items-center justify-between gap-2 ${
                isPinned ? "opacity-0 transition-opacity group-hover:opacity-100" : ""
              }`}
            >
              {/* 底部左侧：命令来源标识（非吸顶常驻显示；吸顶时随底栏 hover 显现） */}
              {commandTag ? (
                <span className="flex items-center gap-1 text-[10px] leading-none text-white/40 select-text font-mono whitespace-nowrap pl-0.5">
                  <span>{commandTag.label}</span>
                  {commandTag.sourceTag && (
                    <>
                      <span aria-hidden="true" className="text-white/20">
                        ·
                      </span>
                      <span className="text-[10px] font-sans tracking-wide text-white/35">
                        {commandTag.sourceTag}
                      </span>
                    </>
                  )}
                </span>
              ) : (
                <div />
              )}

              <div
                className={`flex items-center gap-1 transition-opacity ${
                  isPinned ? "" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                {isPinned && onLocate && (
                  <LxIconButton
                    size="small"
                    aria-label="定位到消息"
                    title={{ content: "定位到消息", placement: "top" }}
                    onClick={onLocate}
                  >
                    <Locate className="h-3 w-3" />
                  </LxIconButton>
                )}
                {isCollapsible && (
                  <LxIconButton
                    size="small"
                    aria-label={isExpanded ? "折叠内容" : "展开内容"}
                    title={{ content: isExpanded ? "折叠内容" : "展开内容", placement: "top" }}
                    onClick={toggleExpand}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </LxIconButton>
                )}
                {/* 即时插话（steer）与指令模板/Skill 消息不可分支、不可编辑。 */}
                {!readOnly &&
                  !message.isSteer &&
                  !message.command &&
                  typeof messageTimestamp === "number" &&
                  onFork && (
                    <LxIconButton
                      size="small"
                      aria-label="从此分支"
                      title={{ content: "从此分支", placement: "top" }}
                      onClick={() => onFork(messageTimestamp)}
                    >
                      <GitBranch className="h-3 w-3" />
                    </LxIconButton>
                  )}
                {!readOnly && !message.isSteer && !message.command && (
                  <LxIconButton
                    size="small"
                    aria-label="编辑消息"
                    title={{ content: "编辑消息", placement: "top" }}
                    onClick={handleStartEdit}
                  >
                    <Pencil className="h-3 w-3" />
                  </LxIconButton>
                )}
                <LxIconButton
                  size="small"
                  aria-label="复制消息"
                  title={{ content: copied ? "已复制" : "复制消息", placement: "top" }}
                  onClick={copyMessageContent}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </LxIconButton>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="group flex min-w-0 w-full flex-col gap-1 px-0">
      {!readOnly && message.model && (
        <LxTooltip placement="top" content={`${message.provider} / ${message.model}`}>
          <span className="flex w-fit select-text items-center text-[11px] leading-none text-white/40">
            {message.model}
          </span>
        </LxTooltip>
      )}
      <div
        data-assistant-bubble="true"
        className={`relative min-w-0 w-full rounded-[18px] rounded-bl-[4px] ${assistantBubbleClass} px-3 py-2 text-[13px] text-white/90`}
      >
        <div className="flex min-w-0 max-w-full flex-col gap-1.5">
          {executionGroups.map((group, groupIndex) => {
            if (group.kind === "text") {
              if (!group.block.text) return null
              return (
                <LxMarkdownPreview
                  key={groupIndex}
                  html={markdownRenderer.render(group.block.text)}
                  previewMode="preview"
                  previewRef={previewRef}
                  className="px-0"
                  contentClassName="py-1"
                  sanitizeCopy
                />
              )
            }

            if (group.kind === "write") {
              return (
                <AgentToolCallBlock
                  key={groupIndex}
                  toolCall={group.block}
                  diff={diffByToolCallId.get(group.block.toolCallId)}
                  defaultExpanded={isStreamingNow}
                />
              )
            }

            if (group.kind === "skill") {
              return (
                <AgentSkillCallBlock
                  key={groupIndex}
                  toolCalls={group.blocks.map(({ block }) => block)}
                />
              )
            }

            if (group.kind === "subagent") {
              return (
                <AgentSubagentBlock
                  key={groupIndex}
                  toolCall={group.block}
                  onOpen={onOpenSubagent}
                />
              )
            }

            if (group.kind === "todo") {
              return <AgentTodoCallBlock key={groupIndex} toolCall={group.block} />
            }

            if (group.kind === "question") {
              return <AgentQuestionBlock key={groupIndex} toolCall={group.block} />
            }

            const toolCount = group.blocks.filter(
              ({ block }) =>
                block.kind === "toolCall" &&
                !isMcpToolCall(block.toolName) &&
                !isWebSearchToolCall(block.toolName),
            ).length
            const webSearchCount = group.blocks.filter(
              ({ block }) => block.kind === "toolCall" && isWebSearchToolCall(block.toolName),
            ).length
            const mcpCount = group.blocks.filter(
              ({ block }) => block.kind === "toolCall" && isMcpToolCall(block.toolName),
            ).length
            const thinkingCount = group.blocks.length - toolCount - webSearchCount - mcpCount
            const executionItems: ExecutionGroupItem[] = group.blocks.flatMap<ExecutionGroupItem>(
              ({ block, isStreaming }, blockIndex) => {
                if (block.kind === "thinking") {
                  return [
                    {
                      kind: "thinking" as const,
                      node: (
                        <AgentThinkingBlock
                          content={block.text}
                          isGenerating={
                            isStreaming &&
                            groupIndex === executionGroups.length - 1 &&
                            blockIndex === group.blocks.length - 1
                          }
                        />
                      ),
                    },
                  ]
                }

                if (isWebSearchToolCall(block.toolName)) {
                  const searchGroup = webSearchCallGroupById.get(block.toolCallId)
                  if (!searchGroup || block.toolCallId !== searchGroup[0]?.toolCallId) return []
                  return [
                    {
                      kind: "webSearch" as const,
                      node: <AgentWebSearchBlock toolCalls={searchGroup} />,
                    },
                  ]
                }

                if (isMcpToolCall(block.toolName)) {
                  const mcpGroup = mcpCallGroupById.get(block.toolCallId)
                  if (!mcpGroup || block.toolCallId !== mcpGroup[0]?.toolCallId) return []
                  return [
                    { kind: "mcp" as const, node: <AgentMcpCallBlock toolCalls={mcpGroup} /> },
                  ]
                }

                if (block.toolName in TOOL_GROUP_SEPARATORS) {
                  const toolGroup = mergeableToolCallGroupById.get(block.toolCallId)
                  if (!toolGroup || block.toolCallId !== toolGroup[0]?.toolCallId) return []
                  // lsp 组：附带合并组内每份检索结果（渲染块复用跳转）。
                  if (toolGroup[0]?.toolName === "lsp") {
                    const lspDetails = toolGroup
                      .map((call) => lspDetailsByToolCallId.get(call.toolCallId))
                      .filter((entry): entry is LspToolDetails => entry !== undefined)
                    return [
                      {
                        kind: "tool" as const,
                        node: <AgentToolCallBlock toolCalls={toolGroup} lspDetails={lspDetails} />,
                      },
                    ]
                  }
                  return [
                    { kind: "tool" as const, node: <AgentToolCallBlock toolCalls={toolGroup} /> },
                  ]
                }

                return [{ kind: "tool" as const, node: <AgentToolCallBlock toolCall={block} /> }]
              },
            )
            return (
              <AgentExecutionGroup
                key={groupIndex}
                toolCount={toolCount}
                thinkingCount={thinkingCount}
                mcpCount={mcpCount}
                webSearchCount={webSearchCount}
                items={executionItems}
              />
            )
          })}
        </div>
        {assistantError && (
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="border-t border-white/10" />
            <div className="text-[13px] text-red-400 italic whitespace-pre-wrap break-words">
              {assistantError}
            </div>
          </div>
        )}
        {/* 停止生成（停止按钮 / Esc）后：底部黄色提示已取消（错误提示样式，颜色改琥珀色）。 */}
        {isAborted && !assistantError && (
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="border-t border-white/10" />
            <div className="text-[13px] text-amber-400 italic">Generation cancelled</div>
          </div>
        )}
        {(isStreamingNow || isLoading) && !assistantError && !showScrollToBottom && (
          <div className="flex items-center py-1" role="status" aria-label="AI 生成中">
            <div className="lx-liquid-loader">
              <span className="lx-liquid-blob" />
            </div>
          </div>
        )}
      </div>
      {isLastAssistant && canContinue && onContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="mt-1 flex w-fit items-center gap-1 rounded-[6px] border border-white/10 px-2 py-1 text-xs text-white/65 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
        >
          <RefreshCw className="h-3 w-3" />
          继续生成
        </button>
      )}
      {isLastAssistant && (
        <SuggestedQuestions
          questions={suggestedQuestions}
          isLoading={isLoadingSuggestedQuestions}
          onSelect={handleSendSuggestedQuestion}
          onEcho={handleEchoSuggestedQuestion}
        />
      )}
      {!isStreamingNow && !isLoading && (hasActionableContent || assistantError) && (
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <LxIconButton
              size="small"
              aria-label="复制消息"
              title={{ content: copied ? "已复制" : "复制消息", placement: "top" }}
              onClick={copyMessageContent}
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </LxIconButton>
            {!readOnly && onDelete && (
              <LxTooltip content="是否删除当前的QA" onConfirm={() => onDelete(message.id)}>
                <LxIconButton size="small" aria-label="删除消息">
                  <Trash2 className="h-3 w-3" />
                </LxIconButton>
              </LxTooltip>
            )}
          </div>
          {qaUsage && (
            <LxTooltip
              placement="top"
              multiline
              content={
                <div className="flex flex-col gap-0.5">
                  <span>Input: {qaUsage.input.toLocaleString()}</span>
                  <span>Output: {qaUsage.output.toLocaleString()}</span>
                  <span>Cache read: {qaUsage.cacheRead.toLocaleString()}</span>
                </div>
              }
            >
              <span className="flex items-center gap-1 text-[10px] leading-none text-white/35 select-text tabular-nums whitespace-nowrap">
                <span>IN {formatTokensShort(qaUsage.input)}</span>
                <span aria-hidden="true">·</span>
                <span>OUT {formatTokensShort(qaUsage.output)}</span>
                <span aria-hidden="true">·</span>
                <span>CACHE {formatTokensShort(qaUsage.cacheRead)}</span>
              </span>
            </LxTooltip>
          )}
        </div>
      )}
    </div>
  )
}
