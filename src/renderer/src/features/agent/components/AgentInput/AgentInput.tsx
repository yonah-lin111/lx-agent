import { Loader2, Send, Square, Zap } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import type { GitWorktreeOption } from "@/features/git"
import { useTranslation } from "@/i18n"
import { AgentContextUsagePill } from "../AgentContextUsagePill"
import { AgentModelSelect, type AgentModelSelectProps } from "../AgentModelSelect"
import { type AgentInputFile, AgentInputFiles } from "./AgentInputFiles"
import {
  AgentMarkdownInput,
  type AgentMarkdownInputProps,
  type AgentMarkdownInputRef,
} from "./AgentMarkdownInput"
import { AgentVoiceInputButton, type AgentVoiceInputButtonRef } from "./AgentVoiceInputButton"

// 图片附件支持集：与 view_image 工具一致（nativeImage 仅稳定解码 PNG/JPEG）。
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg"])
// 图片格式识别（含工具不支持的格式，避免被误判为文本附件）。
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "svg"])

export interface AgentInputProps {
  inputText: string
  isStreaming: boolean
  // 上下文压缩进行中：发送按钮禁用并显示 loading（压缩期间不可发送消息）。
  isCompacting: boolean
  // 上下文压缩是否为手动触发，用于区分 loading 文案。
  isCompactingManual?: boolean
  // 排队消息计数（流式输出期间发送的消息数；>0 时输入区上方展示提示条）。
  queuedCount: number
  // 排队消息原文（提示条 hover 时 tooltip 展示各条问题）。
  queuedMessages: string[]
  onInputChange: (text: string) => void
  onSend: (options?: { delivery?: "queue" | "steer" }) => void
  onStop: () => void
  onClear: () => void
  onUndo: () => void
  isOnlyOneTurnLeft?: () => boolean
  onCompact: () => void
  selectedModel: string
  selectedVariant?: string
  availableVariants?: string[]
  onModelChange: (value: string, variant?: string) => void
  onVariantChange?: (variant: string) => void
  modelOptions: AgentModelSelectProps["options"]
  hasModelOptions: boolean
  // 当前会话上下文容量（估计 token / 压缩窗口；null = 尚无会话数据）。
  contextUsage?: { tokens: number; contextWindow: number } | null
  // 外部输入框引用（父级用于建议问题回显聚焦），与内部 ref 合并。
  inputTextareaRef?: React.Ref<HTMLTextAreaElement | AgentMarkdownInputRef | null>
  projectId?: string
  projectPath?: string
  currentPath?: string
  worktreeName?: string
  // git 工作区选项（/gitWorktree 二级面板；null = 无 git 上下文或非 git 仓库）。
  worktreeOptions: GitWorktreeOption[] | null
  // 选中工作区后的切换回调（参数为目标工作区根目录绝对路径）。
  onWorktreeSelect: (path: string) => void
  // 切换项目回调。
  onProjectSelect?: (projectId: string, projectPath: string) => void
  // /cd 切换目录回调。
  onCdSelect?: (projectId: string, projectPath: string) => void
  // 切换会话回调。
  onSessionSelect?: (sessionId: string) => void
  // 是否允许切换项目（非新 session 禁止切换项目）。默认 true。
  allowProjectChange?: boolean
  // 当前会话 ID。
  currentSessionId?: string | null
  selectedFiles: AgentInputFile[]
  onFilesChange: (files: AgentInputFile[]) => void
  supportsImages: boolean
  // 语音输入按钮引用（供外部快捷键调用 toggleRecording）
  voiceButtonRef?: React.Ref<AgentVoiceInputButtonRef>
}

/**
 * Agent 聊天底栏输入框组件，集成 Markdown 编辑器与命令/文件/模型选择面板。
 */
export const AgentInput = ({
  inputText,
  isStreaming,
  isCompacting = false,
  isCompactingManual = false,
  queuedCount = 0,
  queuedMessages = [],
  onInputChange,
  onSend,
  onStop,
  onClear,
  onUndo,
  isOnlyOneTurnLeft,
  onCompact,
  selectedModel,
  selectedVariant,
  availableVariants,
  onModelChange,
  onVariantChange,
  modelOptions,
  hasModelOptions,
  contextUsage,
  inputTextareaRef,
  projectId,
  projectPath,
  currentPath,
  worktreeName,
  worktreeOptions,
  onWorktreeSelect,
  onProjectSelect,
  onCdSelect,
  onSessionSelect,
  allowProjectChange = true,
  currentSessionId,
  selectedFiles,
  onFilesChange,
  supportsImages,
  voiceButtonRef,
}: AgentInputProps): React.JSX.Element => {
  const markdownInputRef = useRef<AgentMarkdownInputRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { error: errorToast } = useLxAgentToast()
  const { t } = useTranslation()

  // 发送即时插话后的顶部瞬时提示条（参考排队消息提示；数秒后自动消失）。
  const [steerNoticeVisible, setSteerNoticeVisible] = useState(false)
  const steerNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 语音输入状态（录音中 / 转写中），用于动态展示占位符与脉冲提示
  const [voiceRecordingState, setVoiceRecordingState] = useState<
    "idle" | "recording" | "transcribing"
  >("idle")
  const showSteerNotice = useCallback((): void => {
    setSteerNoticeVisible(true)
    if (steerNoticeTimerRef.current !== null) {
      clearTimeout(steerNoticeTimerRef.current)
    }
    steerNoticeTimerRef.current = setTimeout(() => {
      steerNoticeTimerRef.current = null
      setSteerNoticeVisible(false)
    }, 4000)
  }, [])

  useEffect(() => {
    return () => {
      if (steerNoticeTimerRef.current !== null) {
        clearTimeout(steerNoticeTimerRef.current)
      }
    }
  }, [])

  // 暴露对外的 focus / setSelectionRange 兼容方法
  useImperativeHandle(
    inputTextareaRef,
    () =>
      ({
        focus: () => {
          markdownInputRef.current?.focus()
        },
        setSelectionRange: (start: number, end: number) => {
          markdownInputRef.current?.setSelectionRange(start, end)
        },
        get value() {
          return markdownInputRef.current?.getValue() ?? inputText
        },
        set value(val: string) {
          onInputChange(val)
          markdownInputRef.current?.setValue(val)
        },
      }) as unknown as HTMLTextAreaElement,
    [inputText, onInputChange],
  )

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const list = event.target.files
    if (!list || list.length === 0) return

    const nextFiles = [...selectedFiles]
    for (let i = 0; i < list.length; i++) {
      const file = list.item(i)
      if (!file) continue

      const path = window.api.getPathForFile(file)
      if (!path) continue

      // Check if file is already added
      if (nextFiles.some((f) => f.path === path)) continue

      // Classify type based on extension
      const ext = file.name.split(".").pop()?.toLowerCase() || ""
      const type: "image" | "text" = IMAGE_EXTENSIONS.has(ext) ? "image" : "text"

      // 图片格式白名单：view_image 仅支持 PNG/JPEG，其余格式入口拒绝。
      if (type === "image" && !SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
        errorToast(t("agent.unsupportedImageFormat"))
        continue
      }

      // Check image modality support
      if (type === "image" && !supportsImages) {
        errorToast(t("agent.unsupportedImageInput"))
        continue
      }

      // Calculate formatted size
      const sizeBytes = file.size
      let sizeStr = "0 B"
      if (sizeBytes >= 1024 * 1024) {
        sizeStr = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
      } else if (sizeBytes >= 1024) {
        sizeStr = `${(sizeBytes / 1024).toFixed(1)} KB`
      } else {
        sizeStr = `${sizeBytes} B`
      }

      nextFiles.push({
        id: `f-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        name: file.name,
        path,
        type,
        size: sizeStr,
        extension: ext.toUpperCase(),
      })
    }

    onFilesChange(nextFiles)
    // Clear input so same files can be re-selected if removed
    event.target.value = ""
  }

  const handleAddFiles = (filesToAdd: AgentInputFile[]): void => {
    const nextFiles = [...selectedFiles]
    for (const file of filesToAdd) {
      if (nextFiles.some((f) => f.path === file.path)) continue
      if (file.type === "image") {
        const ext = (file.extension || file.name.split(".").pop() || "").toLowerCase()
        if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
          errorToast(t("agent.unsupportedImageFormat"))
          continue
        }
        if (!supportsImages) {
          errorToast(t("agent.unsupportedImageInput"))
          continue
        }
      }
      nextFiles.push(file)
    }
    onFilesChange(nextFiles)
  }

  const handleRemoveFile = (id: string): void => {
    onFilesChange(selectedFiles.filter((f) => f.id !== id))
  }

  const handleContainerPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement
    if (target.closest("button") || target.closest(".cm-editor")) return
    // 命令面板为可交互浮层：取消 pointerdown 会抑制后续 mousedown，导致面板点选失效。
    if (target.closest('[role="listbox"]')) return
    event.preventDefault()
    markdownInputRef.current?.focus()
  }

  const handleSend = (options?: { delivery?: "queue" | "steer" }): void => {
    if (!inputText.trim() && selectedFiles.length === 0) return
    // 即时插话（steer）展示顶部瞬时提示条。
    if (options?.delivery === "steer") {
      showSteerNotice()
    }
    onSend(options)
  }

  const handleVoiceTranscribed = (transcribedText: string): void => {
    const trimmed = transcribedText.trim()
    if (!trimmed) return
    const current = markdownInputRef.current?.getValue() ?? inputText
    const baseText = current
      ? current.endsWith(" ") || current.endsWith("\n")
        ? current
        : `${current} `
      : ""

    // 动态打字动画效果：平滑输出识别字句至输入框
    let charIndex = 0
    const stepInterval = Math.max(10, Math.min(30, Math.floor(300 / trimmed.length)))

    const timer = setInterval(() => {
      charIndex++
      const partial = trimmed.slice(0, charIndex)
      const nextVal = `${baseText}${partial}`
      onInputChange(nextVal)
      markdownInputRef.current?.setValue(nextVal)

      if (charIndex >= trimmed.length) {
        clearInterval(timer)
        markdownInputRef.current?.focus()
      }
    }, stepInterval)
  }

  const addButton = (
    <>
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
      />
      <LxIconButton
        shape="circle"
        preset="add"
        aria-label={t("agent.addAttachment")}
        title={{ content: t("agent.addAttachment"), placement: "top" }}
        className="agent-input-add-btn"
        onClick={() => fileInputRef.current?.click()}
      />
    </>
  )

  const actionButton = isStreaming ? (
    <LxIconButton
      shape="circle"
      aria-label={t("agent.stopGenerating")}
      title={{ content: t("agent.stopGenerating"), placement: "top" }}
      onClick={onStop}
      hoverBgClass="hover:bg-white/90"
      className="agent-input-action-btn agent-input-stop-btn bg-white !text-black shadow-sm"
    >
      <Square className="h-3 w-3 fill-current" />
    </LxIconButton>
  ) : isCompacting ? (
    <LxIconButton
      shape="circle"
      aria-label={isCompactingManual ? t("agent.compactingManual") : t("agent.compactingAuto")}
      title={{
        content: isCompactingManual ? t("agent.compactingManual") : t("agent.compactingAuto"),
        placement: "top",
      }}
      disabled
      className="agent-input-action-btn agent-input-compacting-btn bg-white/15 !text-white/30"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    </LxIconButton>
  ) : (
    <LxIconButton
      shape="circle"
      aria-label={t("agent.send")}
      title={{ content: t("agent.sendMessage"), placement: "top" }}
      onClick={() => handleSend()}
      disabled={!inputText.trim() && selectedFiles.length === 0}
      hoverBgClass="hover:bg-white/90"
      className="agent-input-action-btn agent-input-send-btn bg-white !text-black shadow-sm disabled:!bg-white/15 disabled:!text-white/30 disabled:!opacity-100 disabled:shadow-none"
    >
      <Send className="h-3.5 w-3.5" />
    </LxIconButton>
  )

  return (
    <div className="relative bg-transparent p-0.5 pt-1 pb-0">
      {/* 排队消息提示：流式输出期间发送的消息等待当前回复结束后自动发送；hover 展示排队问题列表。 */}
      {queuedCount > 0 && (
        <LxTooltip
          title={`已排队 ${queuedCount} 条消息`}
          placement="top"
          multiline
          content={
            <div className="flex max-h-[40vh] max-w-[min(360px,60vw)] flex-col gap-1 overflow-y-auto py-0.5">
              {queuedMessages.map((text, index) => (
                <div
                  key={index}
                  className="flex items-start gap-1.5 text-xs leading-[18px] text-white/75"
                >
                  <span className="mt-px shrink-0 text-white/35">{index + 1}.</span>
                  <span className="min-w-0 break-words">{text}</span>
                </div>
              ))}
            </div>
          }
        >
          <div className="agent-input-queued-notice mb-1 flex items-center gap-1.5 px-1 text-[11px] text-white/45">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            <span className="truncate">
              {t("agent.queuedMessagesCount", { count: queuedCount })}
            </span>
          </div>
        </LxTooltip>
      )}
      {steerNoticeVisible && (
        <div className="agent-input-steer-notice mb-1 flex items-center gap-1.5 px-1 text-[11px] text-white/45">
          <Zap className="h-3 w-3 shrink-0 text-amber-400/80" />
          <span className="truncate">{t("agent.steerSentNotice")}</span>
        </div>
      )}
      <AgentInputFiles files={selectedFiles} onRemove={handleRemoveFile} />
      <div
        ref={containerRef}
        className={`agent-input-container relative flex flex-col justify-between rounded-[6px] border bg-[#2a2a2a] px-2.5 pt-2 pb-2 shadow-sm transition-[border-color,box-shadow] duration-150 focus-within:border-white/20 focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.06)] ${
          voiceRecordingState === "recording"
            ? "border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.15)]"
            : voiceRecordingState === "transcribing"
              ? "border-blue-500/40"
              : "border-white/10"
        }`}
        onPointerDown={handleContainerPointerDown}
      >
        <AgentMarkdownInput
          ref={markdownInputRef}
          value={inputText}
          placeholder={
            voiceRecordingState === "recording"
              ? t("agent.voiceListeningPlaceholder")
              : voiceRecordingState === "transcribing"
                ? t("agent.voiceTranscribingPlaceholder")
                : t("agent.inputPlaceholder")
          }
          onChange={onInputChange}
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={onStop}
          panelAnchorRef={containerRef}
          projectId={projectId}
          projectPath={projectPath}
          currentPath={currentPath}
          worktreeName={worktreeName}
          modelOptions={modelOptions as AgentMarkdownInputProps["modelOptions"]}
          onModelChange={onModelChange}
          worktreeOptions={worktreeOptions}
          onWorktreeSelect={onWorktreeSelect}
          onProjectSelect={onProjectSelect}
          onCdSelect={onCdSelect}
          onSessionSelect={onSessionSelect}
          allowProjectChange={allowProjectChange}
          currentSessionId={currentSessionId}
          onClear={onClear}
          onUndo={onUndo}
          isOnlyOneTurnLeft={isOnlyOneTurnLeft}
          onCompact={onCompact}
          onAddFiles={handleAddFiles}
        />
        <div className="flex w-full items-center justify-between pt-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <AgentVoiceInputButton
              ref={voiceButtonRef}
              onTranscribed={handleVoiceTranscribed}
              onRecordingStateChange={setVoiceRecordingState}
            />
            {addButton}
            <AgentModelSelect
              value={selectedModel}
              onChange={onModelChange}
              options={modelOptions}
              disabled={!hasModelOptions}
              variant={selectedVariant}
              variants={availableVariants}
              onVariantChange={onVariantChange}
            />
            <AgentContextUsagePill contextUsage={contextUsage} />
          </div>

          <div className="flex items-center gap-1.5">{actionButton}</div>
        </div>
      </div>
    </div>
  )
}
