import { Check, ChevronDown, ChevronUp, Copy, GitBranch, Locate, Pencil, X } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { AgentMessageFiles } from "@/features/agent/components/AgentMessageList/AgentMessageFiles"
import type { ChatMessage } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { sanitizeSelectionTrailingNewlines } from "@/lib/clipboard"
import type { AgentMessageItemProps } from "./types"
import { extractUserText, getUserBubbleClass, resolveCommandTag } from "./utils"

// 用户消息组件 Props 接口。
export interface AgentUserMessageProps {
  message: ChatMessage
  isPinned?: boolean
  isEditing?: boolean
  readOnly?: boolean
  onStartEdit?: () => void
  onCancelEdit?: () => void
  onEdit?: (id: string, newContent: string) => void
  onFork?: (userMessageTimestamp: number) => void
  onLocate?: () => void
}

// 用户消息气泡与交互渲染组件。
export const AgentUserMessage = ({
  message,
  isPinned = false,
  isEditing: isEditingProp,
  readOnly = false,
  onStartEdit,
  onCancelEdit,
  onEdit,
  onFork,
  onLocate,
}: AgentUserMessageProps): React.JSX.Element => {
  const { t } = useTranslation()
  const messageTimestamp = message.timestamp
  const userBubbleClass = getUserBubbleClass(message, readOnly)

  const userContentRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isCollapsible, setIsCollapsible] = useState(false)
  const [isClamped, setIsClamped] = useState(false)
  const [localIsEditing, setLocalIsEditing] = useState(false)
  const isEditing = isEditingProp ?? localIsEditing

  const userText = useMemo(() => extractUserText(message), [message])
  const commandTag = useMemo(() => resolveCommandTag(message), [message])

  const [editText, setEditText] = useState(
    message.blocks.find((block) => block.kind === "text")?.text ?? "",
  )

  const clampLineCount = isPinned ? 1 : 3
  const clampLineClass = isPinned ? "line-clamp-1" : "line-clamp-3"

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

  const measureCollapse = useCallback((): void => {
    const content = userContentRef.current
    if (!content) return

    const wasClamped =
      content.classList.contains("line-clamp-3") || content.classList.contains("line-clamp-1")
    if (wasClamped) {
      content.classList.remove("line-clamp-3")
      content.classList.remove("line-clamp-1")
    }

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
  }, [clampLineClass, isExpanded])

  useLayoutEffect(() => {
    if (isEditing) return
    measureCollapse()
  }, [isEditing, measureCollapse])

  useEffect(() => {
    if (isEditing) return
    const content = userContentRef.current
    if (!content) return

    let lastWidth = content.clientWidth
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      if (content.clientWidth === lastWidth) return
      lastWidth = content.clientWidth
      measureCollapse()
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [isEditing, measureCollapse])

  const toggleExpand = (): void => {
    const content = userContentRef.current
    if (!content) return

    const nextIsExpanded = !isExpanded
    if (nextIsExpanded) {
      setIsClamped(false)
      content.style.height = ""
    } else {
      const lineHeight = Number.parseFloat(window.getComputedStyle(content).lineHeight) || 20
      content.style.height = `${lineHeight * clampLineCount}px`
      setIsClamped(true)
    }
    setIsExpanded(nextIsExpanded)
  }

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
      await navigator.clipboard.writeText(userText)
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

  return (
    <div ref={outerRef} className="group flex w-full flex-col items-end px-0">
      <div
        ref={contentRef}
        className="agent-pinned-shift flex w-fit max-w-[88%] flex-col items-end"
        style={{ transform: isPinned ? `translateX(-${pinShift}px)` : undefined }}
      >
        {isEditing ? (
          <div
            data-user-bubble="true"
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
                aria-label={t("agent.cancelEdit")}
                title={{ content: t("common.cancel"), placement: "top" }}
                onClick={handleCancelEdit}
              >
                <X className="h-3.5 w-3.5" />
              </LxIconButton>
              <LxIconButton
                size="small"
                aria-label={t("agent.sendMessage")}
                title={{ content: t("agent.sendMessage"), placement: "top" }}
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
              data-user-bubble="true"
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
            className={`mt-1 flex items-center gap-2 transition-opacity ${
              isPinned
                ? `opacity-0 group-hover:opacity-100 rounded-[6px] ${userBubbleClass} px-2 py-0.5 shadow-sm w-fit self-end`
                : "w-full justify-between"
            }`}
          >
            {commandTag ? (
              <span className="agent-message-command-tag flex items-center gap-1 text-[10px] leading-none text-white/60 select-text font-mono whitespace-nowrap pl-0.5">
                <span className="agent-message-command-label">{commandTag.label}</span>
                {commandTag.sourceTag && (
                  <>
                    <span
                      aria-hidden="true"
                      className="agent-message-command-separator text-white/20"
                    >
                      ·
                    </span>
                    <span className="agent-message-command-source text-[10px] font-sans tracking-wide text-white/35">
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
                  aria-label={t("agent.locateMessage")}
                  title={{ content: t("agent.locateMessage"), placement: "top" }}
                  onClick={onLocate}
                >
                  <Locate className="h-3.5 w-3.5" />
                </LxIconButton>
              )}
              {isCollapsible && (
                <LxIconButton
                  size="small"
                  aria-label={
                    isExpanded ? t("markdown.collapseContent") : t("markdown.expandContent")
                  }
                  title={{
                    content: isExpanded
                      ? t("markdown.collapseContent")
                      : t("markdown.expandContent"),
                    placement: "top",
                  }}
                  onClick={toggleExpand}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </LxIconButton>
              )}
              {!readOnly &&
                !message.isSteer &&
                !message.command &&
                typeof messageTimestamp === "number" &&
                onFork && (
                  <LxIconButton
                    size="small"
                    aria-label={t("agent.forkFromHere")}
                    title={{ content: t("agent.forkFromHere"), placement: "top" }}
                    onClick={() => onFork(messageTimestamp)}
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                  </LxIconButton>
                )}
              {!readOnly && !message.isSteer && !message.command && (
                <LxIconButton
                  size="small"
                  aria-label={t("agent.editMessage")}
                  title={{ content: t("agent.editMessage"), placement: "top" }}
                  onClick={handleStartEdit}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </LxIconButton>
              )}
              <LxIconButton
                size="small"
                aria-label={t("agent.copyMessage")}
                title={{
                  content: copied ? t("common.copied") : t("agent.copyMessage"),
                  placement: "top",
                }}
                onClick={copyMessageContent}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </LxIconButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
