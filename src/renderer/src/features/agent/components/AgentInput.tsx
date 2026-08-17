import { Loader2, Maximize2, Minimize2, Send, Square } from "lucide-react"
import type React from "react"
import { useImperativeHandle, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import type { GitWorktreeOption } from "@/features/git"
import { type AgentInputFile, AgentInputFiles } from "./AgentInputFiles"
import {
  AgentMarkdownInput,
  type AgentMarkdownInputProps,
  type AgentMarkdownInputRef,
} from "./AgentMarkdownInput"
import { AgentModelSelect, type AgentModelSelectProps } from "./AgentModelSelect"

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
  onSend: () => void
  onStop: () => void
  onClear: () => void
  onUndo: () => void
  onCompact: () => void
  selectedModel: string
  onModelChange: (value: string) => void
  modelOptions: AgentModelSelectProps["options"]
  hasModelOptions: boolean
  // 外部输入框引用（父级用于建议问题回显聚焦），与内部 ref 合并。
  inputTextareaRef?: React.Ref<HTMLTextAreaElement | AgentMarkdownInputRef | null>
  projectId?: string
  projectPath?: string
  // git 工作区选项（/gitWorktree 二级面板；null = 无 git 上下文或非 git 仓库）。
  worktreeOptions: GitWorktreeOption[] | null
  // 选中工作区后的切换回调（参数为目标工作区根目录绝对路径）。
  onWorktreeSelect: (path: string) => void
  selectedFiles: AgentInputFile[]
  onFilesChange: (files: AgentInputFile[]) => void
  supportsImages: boolean
}

/**
 * Agent 聊天底栏输入框组件，集成 Markdown 编辑器与命令/文件/模型选择面板。
 */
export const AgentInput = ({
  inputText,
  isStreaming,
  isCompacting,
  isCompactingManual = false,
  queuedCount,
  queuedMessages,
  onInputChange,
  onSend,
  onStop,
  onClear,
  onUndo,
  onCompact,
  selectedModel,
  onModelChange,
  modelOptions,
  hasModelOptions,
  inputTextareaRef,
  projectId,
  projectPath,
  worktreeOptions,
  onWorktreeSelect,
  selectedFiles,
  onFilesChange,
  supportsImages,
}: AgentInputProps): React.JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false)
  const markdownInputRef = useRef<AgentMarkdownInputRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { error: errorToast } = useLxToast()

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
          markdownInputRef.current?.setValue(val)
        },
      }) as unknown as HTMLTextAreaElement,
    [inputText],
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
      const isImage = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "svg"].includes(ext)
      const type: "image" | "text" = isImage ? "image" : "text"

      // Check image modality support
      if (type === "image" && !supportsImages) {
        errorToast("当前所选模型不支持图片多模态输入，请切换模型。")
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

  const handleRemoveFile = (id: string): void => {
    onFilesChange(selectedFiles.filter((f) => f.id !== id))
  }

  const handleContainerPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement
    if (target.closest("button") || target.closest(".cm-editor")) return
    event.preventDefault()
    markdownInputRef.current?.focus()
  }

  const handleSend = (): void => {
    if (!inputText.trim() && selectedFiles.length === 0) return
    onSend()
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
        aria-label="添加附件"
        title={{ content: "添加附件", placement: "top" }}
        hoverBgClass="hover:bg-white/20"
        hoverTextClass="hover:text-white"
        className="bg-white/10 !text-white/70"
        onClick={() => fileInputRef.current?.click()}
      />
    </>
  )

  const actionButton = isStreaming ? (
    <LxIconButton
      shape="circle"
      aria-label="停止生成"
      title={{ content: "停止生成", placement: "top" }}
      onClick={onStop}
      hoverBgClass="hover:bg-white/90"
      className="bg-white !text-black shadow-sm"
    >
      <Square className="h-3 w-3 fill-current" />
    </LxIconButton>
  ) : isCompacting ? (
    <LxIconButton
      shape="circle"
      aria-label={isCompactingManual ? "手动压缩上下文中" : "自动压缩上下文中"}
      title={{
        content: isCompactingManual ? "正在手动压缩上下文" : "正在自动压缩上下文",
        placement: "top",
      }}
      disabled
      className="bg-white/15 !text-white/30"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    </LxIconButton>
  ) : (
    <LxIconButton
      shape="circle"
      aria-label="发送消息"
      title={{ content: "发送消息 (Enter)", placement: "top" }}
      onClick={handleSend}
      disabled={!inputText.trim() && selectedFiles.length === 0}
      hoverBgClass="hover:bg-white/90"
      className="bg-white !text-black shadow-sm disabled:!bg-white/15 disabled:!text-white/30 disabled:!opacity-100 disabled:shadow-none"
    >
      <Send className="h-3.5 w-3.5" />
    </LxIconButton>
  )

  return (
    <div className="bg-transparent p-0.5 pt-1 pb-0">
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
          <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-white/45">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            <span className="truncate">已排队 {queuedCount} 条消息，当前回复结束后自动发送</span>
          </div>
        </LxTooltip>
      )}
      <AgentInputFiles files={selectedFiles} onRemove={handleRemoveFile} />
      <div
        ref={containerRef}
        className="relative flex flex-col justify-between rounded-[6px] border border-white/10 bg-[#2a2a2a] px-2.5 pt-2 pb-2 shadow-sm transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/10"
        onPointerDown={handleContainerPointerDown}
      >
        <AgentMarkdownInput
          ref={markdownInputRef}
          value={inputText}
          onChange={onInputChange}
          onSend={handleSend}
          isExpanded={isExpanded}
          panelAnchorRef={containerRef}
          projectId={projectId}
          projectPath={projectPath}
          modelOptions={modelOptions as AgentMarkdownInputProps["modelOptions"]}
          onModelChange={onModelChange}
          worktreeOptions={worktreeOptions}
          onWorktreeSelect={onWorktreeSelect}
          onClear={onClear}
          onUndo={onUndo}
          onCompact={onCompact}
        />
        <div className="flex w-full items-center justify-between pt-1.5">
          <div className="flex min-w-0 items-center gap-2">
            {addButton}
            <AgentModelSelect
              value={selectedModel}
              onChange={onModelChange}
              options={modelOptions}
              disabled={!hasModelOptions}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <LxIconButton
              shape="circle"
              showHoverBg={false}
              aria-label={isExpanded ? "自适应高度" : "扩大输入框"}
              title={{
                content: isExpanded ? "自适应高度" : "扩大输入框",
                placement: "top",
              }}
              onClick={() => setIsExpanded((prev) => !prev)}
            >
              {isExpanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </LxIconButton>
            {actionButton}
          </div>
        </div>
      </div>
    </div>
  )
}
