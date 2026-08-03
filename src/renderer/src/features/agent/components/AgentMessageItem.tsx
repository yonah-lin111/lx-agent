import { Check, ChevronDown, ChevronUp, Copy, Pencil, X } from "lucide-react"
import type React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { AgentThinkingBlock } from "@/features/agent/components/AgentThinkingBlock"
import { AgentToolCallBlock } from "@/features/agent/components/AgentToolCallBlock"
import type { ChatMessage } from "@/features/agent/types"

interface AgentMessageItemProps {
  message: ChatMessage
  continuationMessages?: ChatMessage[]
  isEditing?: boolean
  onStartEdit?: () => void
  onCancelEdit?: () => void
  onEdit?: (id: string, newContent: string) => void
}

/**
 * 渲染单条 Agent 或用户消息（blocks 渲染：文本 / 思考 / 工具调用 / 工具结果）。
 */
export const AgentMessageItem = ({
  message,
  continuationMessages = [],
  isEditing: isEditingProp,
  onStartEdit,
  onCancelEdit,
  onEdit,
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
  // 工具结果折叠状态（按 toolCallId）。
  const [collapsedResults, setCollapsedResults] = useState<Record<string, boolean>>({})
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
  // 合并同一轮中所有 read 工具调用的文件路径。
  const readToolCalls = useMemo(
    () =>
      displayBlocks.flatMap(({ block }) =>
        block.kind === "toolCall" && block.toolName === "read" ? [block] : [],
      ),
    [displayBlocks],
  )
  const readToolCallIds = useMemo(
    () => new Set(readToolCalls.map((block) => block.toolCallId)),
    [readToolCalls],
  )
  const assistantError = !isUser
    ? [message, ...continuationMessages].find((currentMessage) => currentMessage.error)?.error
    : undefined

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
      await navigator.clipboard.writeText(text)
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
            <div className="rounded-[6px] bg-white/10 px-3 py-2 text-[13px] text-white/90 whitespace-pre-wrap break-words">
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
    <div className="group flex flex-col gap-1 px-0">
      {assistantError && (
        <div className="rounded-[6px] border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[12px] text-red-400">
          {assistantError}
        </div>
      )}

      <div className="relative rounded-[6px] bg-transparent p-0 text-[13px] text-white/90">
        <div className="flex flex-col gap-1.5">
          {displayBlocks.map(({ block, isStreaming }, index) => {
            if (block.kind === "text") {
              if (!block.text) return null
              return (
                <LxMarkdownPreview
                  key={index}
                  html={markdownRenderer.render(block.text)}
                  previewMode="preview"
                  previewRef={previewRef}
                  className="px-0"
                  contentClassName="py-1"
                />
              )
            }
            if (block.kind === "thinking") {
              return (
                <AgentThinkingBlock
                  key={index}
                  content={block.text}
                  isGenerating={isStreaming && index === displayBlocks.length - 1}
                />
              )
            }
            if (block.kind === "toolCall") {
              if (block.toolName === "read") {
                if (block.toolCallId !== readToolCalls[0]?.toolCallId) return null

                return (
                  <AgentToolCallBlock key={`${block.toolCallId}-call`} toolCalls={readToolCalls} />
                )
              }

              const nextBlock = displayBlocks[index + 1]?.block
              const inlineResult =
                nextBlock?.kind === "toolResult" && nextBlock.toolCallId === block.toolCallId
                  ? nextBlock
                  : undefined
              const collapsed = collapsedResults[block.toolCallId] !== false

              return (
                <AgentToolCallBlock
                  key={`${block.toolCallId}-call`}
                  toolCall={block}
                  toolResult={inlineResult}
                  isResultExpanded={!collapsed}
                  onToggleResult={
                    inlineResult
                      ? () =>
                          setCollapsedResults((previousResults) => ({
                            ...previousResults,
                            [block.toolCallId]: !collapsed,
                          }))
                      : undefined
                  }
                />
              )
            }
            if (readToolCallIds.has(block.toolCallId)) return null

            const previousBlock = displayBlocks[index - 1]?.block
            if (
              previousBlock?.kind === "toolCall" &&
              previousBlock.toolCallId === block.toolCallId
            ) {
              return null
            }
            const collapsed = collapsedResults[block.toolCallId] !== false

            return (
              <AgentToolCallBlock
                key={`${block.toolCallId}-result`}
                toolResult={block}
                isResultExpanded={block.toolName === "read" ? undefined : !collapsed}
                onToggleResult={
                  block.toolName === "read"
                    ? undefined
                    : () =>
                        setCollapsedResults((previousResults) => ({
                          ...previousResults,
                          [block.toolCallId]: !collapsed,
                        }))
                }
              />
            )
          })}
        </div>
        <div className="mt-1 flex items-center justify-start opacity-0 transition-opacity group-hover:opacity-100">
          <LxIconButton
            size="small"
            aria-label="复制消息"
            title={{ content: copied ? "已复制" : "复制消息", placement: "top" }}
            onClick={copyMessageContent}
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </LxIconButton>
        </div>
      </div>
    </div>
  )
}
