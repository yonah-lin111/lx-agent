import { Check, ChevronDown, ChevronUp, Copy, Pencil, Trash2, X } from "lucide-react"
import type React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { AgentDiffBlock } from "@/features/agent/components/AgentDiffBlock"
import {
  AgentExecutionGroup,
  type ExecutionGroupItem,
} from "@/features/agent/components/AgentExecutionGroup"
import { AgentMcpCallBlock } from "@/features/agent/components/AgentMcpCallBlock"
import { AgentSkillCallBlock } from "@/features/agent/components/AgentSkillCallBlock"
import { AgentThinkingBlock } from "@/features/agent/components/AgentThinkingBlock"
import { AgentToolCallBlock } from "@/features/agent/components/AgentToolCallBlock"
import { AgentWebSearchBlock } from "@/features/agent/components/AgentWebSearchBlock"
import { TOOL_GROUP_SEPARATORS } from "@/features/agent/constants"
import type { ChatBlock, ChatMessage } from "@/features/agent/types"
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

// Skill 调用使用的工具名。
const SKILL_TOOL_NAME = "read_skill"

// Web Search 调用使用的工具名。
const WEB_SEARCH_TOOL_NAME = "web_search"

// 判断是否为 Skill 调用。
const isSkillToolCall = (toolName: string): boolean => toolName === SKILL_TOOL_NAME

// 判断是否为联网搜索调用。
const isWebSearchToolCall = (toolName: string): boolean => toolName === WEB_SEARCH_TOOL_NAME

// 判断是否为 MCP 调用（MCP 工具全名为 `server_tool`，内置工具名不含下划线）。
const isMcpToolCall = (toolName: string): boolean =>
  toolName !== SKILL_TOOL_NAME && !isWebSearchToolCall(toolName) && toolName.includes("_")

// 提取 MCP 服务名（全名首段）。
const getMcpServerName = (toolName: string): string => {
  const separatorIndex = toolName.indexOf("_")
  return separatorIndex > 0 ? toolName.slice(0, separatorIndex) : toolName
}

// 判断是否为写操作工具（文件修改，独立展示且不参与执行折叠）。
const isWriteToolCall = (toolName: string): boolean => toolName === "edit" || toolName === "write"

interface AgentMessageItemProps {
  message: ChatMessage
  continuationMessages?: ChatMessage[]
  // Agent 会话运行中且本条目为最后一条 AI 消息时由列表注入，使 loader 跨工具执行阶段保持显示。
  isLoading?: boolean
  isEditing?: boolean
  onStartEdit?: () => void
  onCancelEdit?: () => void
  onEdit?: (id: string, newContent: string) => void
  onDelete?: (messageId: string) => void
}

/**
 * 渲染单条 Agent 或用户消息（blocks 渲染：文本 / 思考 / 工具调用 / 工具结果）。
 */
export const AgentMessageItem = ({
  message,
  continuationMessages = [],
  isLoading,
  isEditing: isEditingProp,
  onStartEdit,
  onCancelEdit,
  onEdit,
  onDelete,
}: AgentMessageItemProps): React.JSX.Element => {
  const isUser = message.role === "user"
  const previewRef = useRef<HTMLDivElement>(null)
  const userContentRef = useRef<HTMLDivElement>(null)
  const userBubbleRef = useRef<HTMLDivElement>(null)
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

  // 记录上一次容器的渲染高度，用于 FLIP 动画
  const lastHeightRef = useRef<number>(0)
  const transitionCleanupRef = useRef<(() => void) | null>(null)
  const isTransitioningRef = useRef<boolean>(false)

  const userText = useMemo(
    () =>
      message.blocks
        .filter((block) => block.kind === "text")
        .map((block) => block.text)
        .join("\n"),
    [message.blocks],
  )

  // 按真实事件顺序合并同一轮 Agent 消息中的内容块。
  const displayBlocks = useMemo(
    () =>
      [message, ...continuationMessages].flatMap((currentMessage) =>
        currentMessage.blocks.map((block) => ({ block, isStreaming: currentMessage.isStreaming })),
      ),
    [continuationMessages, message],
  )
  // 工具结果携带的 diff 按 toolCallId 索引（写工具组渲染用）。
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
  // 当前（含 continuation）是否仍在流式生成。
  const isStreamingNow =
    message.isStreaming || continuationMessages.some((currentMessage) => currentMessage.isStreaming)
  // 是否存在可展示的文本输出。
  const hasOutput = displayBlocks.some(
    ({ block }) => block.kind === "text" && block.text.trim() !== "",
  )

  // 使用 ResizeObserver 记录用户气泡容器最新高度
  useEffect(() => {
    if (!isUser) return
    const el = userBubbleRef.current
    if (!el || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver((entries) => {
      if (isTransitioningRef.current) return
      for (const entry of entries) {
        lastHeightRef.current = entry.target.getBoundingClientRect().height
      }
    })

    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [isUser])

  // 当 isEditing 状态发生切换时，触发平滑的 FLIP 高度过渡动效
  useLayoutEffect(() => {
    if (!isUser) return
    const el = userBubbleRef.current
    if (!el) return

    if (transitionCleanupRef.current) {
      transitionCleanupRef.current()
    }

    const newHeight = el.getBoundingClientRect().height

    if (lastHeightRef.current && lastHeightRef.current !== newHeight) {
      const oldHeight = lastHeightRef.current

      isTransitioningRef.current = true
      el.style.overflow = "hidden"
      el.style.transition = "none"
      el.style.height = `${oldHeight}px`

      // 强制重排
      void el.offsetHeight

      el.style.transition = "height 0.25s cubic-bezier(0.2, 0.85, 0.2, 1)"
      el.style.height = `${newHeight}px`

      const handleTransitionEnd = (e: TransitionEvent) => {
        if (e.propertyName === "height") {
          el.style.transition = ""
          el.style.height = ""
          el.style.overflow = ""
          isTransitioningRef.current = false
          lastHeightRef.current = newHeight
        }
      }

      el.addEventListener("transitionend", handleTransitionEnd)

      const cleanup = () => {
        el.removeEventListener("transitionend", handleTransitionEnd)
      }
      transitionCleanupRef.current = cleanup
    } else {
      lastHeightRef.current = newHeight
    }

    return () => {
      if (transitionCleanupRef.current) {
        transitionCleanupRef.current()
        transitionCleanupRef.current = null
      }
    }
  }, [isEditing, isUser])

  // 编辑模式下根据输入内容动态自动调整 textarea 高度
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current
      el.style.height = "auto"
      const maxHeight = 140
      const targetHeight = Math.min(el.scrollHeight, maxHeight)
      el.style.height = `${targetHeight}px`
    }
  }, [editText, isEditing])

  // 进入编辑模式时自动聚焦 textarea 并定位光标至末尾
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

  // 检测用户消息是否超过3行。
  useLayoutEffect(() => {
    if (!isUser || isEditing) return
    const content = userContentRef.current
    if (!content) return

    // 临时移除 line-clamp 以准确测量完整高度
    const wasClamped = content.classList.contains("line-clamp-3")
    if (wasClamped) {
      content.classList.remove("line-clamp-3")
    }

    const lineHeight = Number.parseFloat(window.getComputedStyle(content).lineHeight) || 20
    const collapsedHeight = lineHeight * 3
    const fullHeight = content.scrollHeight

    if (wasClamped && !isExpanded) {
      content.classList.add("line-clamp-3")
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
  }, [userText, isUser, isExpanded, isEditing])

  const toggleExpand = (): void => {
    const content = userContentRef.current
    if (!content) return

    const nextIsExpanded = !isExpanded
    const lineHeight = Number.parseFloat(window.getComputedStyle(content).lineHeight) || 20
    const collapsedHeight = lineHeight * 3

    if (nextIsExpanded) {
      setIsClamped(false)
      content.style.height = `${collapsedHeight}px`

      requestAnimationFrame(() => {
        content.style.height = `${content.scrollHeight}px`
      })

      content.addEventListener(
        "transitionend",
        () => {
          if (content.dataset.expanded === "true") {
            content.style.height = ""
          }
        },
        { once: true },
      )
    } else {
      content.style.height = `${content.scrollHeight}px`

      requestAnimationFrame(() => {
        content.style.height = `${collapsedHeight}px`
      })

      content.addEventListener(
        "transitionend",
        () => {
          if (content.dataset.expanded === "false") {
            setIsClamped(true)
          }
        },
        { once: true },
      )
    }

    content.dataset.expanded = nextIsExpanded ? "true" : "false"
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

  if (isUser) {
    return (
      <div className="group flex flex-col items-end px-0 w-full">
        <div ref={userBubbleRef} className="w-fit max-w-[88%] flex flex-col items-end">
          {isEditing ? (
            <div className="flex flex-col gap-2 w-[380px] max-w-full rounded-[6px] bg-white/10 p-2.5 shadow-sm">
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
                className="w-full resize-none bg-transparent text-[13px] text-white/90 focus:outline-none custom-scrollbar"
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
            <div
              className="rounded-[6px] bg-white/10 px-3 py-2 text-[13px] text-white/90 whitespace-pre-wrap break-words"
              onCopy={handleBubbleCopy}
            >
              <div
                ref={userContentRef}
                className={`overflow-hidden transition-[height] duration-300 ease-in-out ${
                  isClamped ? "line-clamp-3" : ""
                }`}
              >
                {userText}
              </div>
            </div>
          )}
        </div>
        {!isEditing && (
          <div className="mt-1 flex items-center gap-1 justify-end opacity-0 transition-opacity group-hover:opacity-100">
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
            <LxIconButton
              size="small"
              aria-label="编辑消息"
              title={{ content: "编辑消息", placement: "top" }}
              onClick={handleStartEdit}
            >
              <Pencil className="h-3 w-3" />
            </LxIconButton>
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
        )}
      </div>
    )
  }

  return (
    <div className="group flex min-w-0 w-full flex-col gap-1 px-0">
      {assistantError && <div className="text-[13px] text-red-400">{assistantError}</div>}

      <div className="relative min-w-0 max-w-full rounded-[6px] bg-transparent p-0 text-[13px] text-white/90">
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
              const diff = diffByToolCallId.get(group.block.toolCallId)
              return (
                <div key={groupIndex} className="flex min-w-0 flex-col gap-1">
                  <AgentToolCallBlock toolCall={group.block} />
                  {diff && diff.lines.length > 0 && <AgentDiffBlock diff={diff} />}
                </div>
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
        {(isStreamingNow || isLoading) && !assistantError && (
          <div className="flex items-center py-1" role="status" aria-label="AI 生成中">
            <div className="lx-liquid-loader">
              <span className="lx-liquid-blob" />
            </div>
          </div>
        )}
        {!isStreamingNow && (hasOutput || assistantError) && (
          <div className="mt-1 flex items-center justify-start opacity-0 transition-opacity group-hover:opacity-100">
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
            {onDelete && (
              <LxTooltip content="是否删除当前的QA" onConfirm={() => onDelete(message.id)}>
                <LxIconButton size="small" aria-label="删除消息">
                  <Trash2 className="h-3 w-3" />
                </LxIconButton>
              </LxTooltip>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
