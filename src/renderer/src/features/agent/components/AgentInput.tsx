import type { ProjectFileEntry } from "@shared/project"
import { Loader2, Send, Square, Zap } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import type { GitWorktreeOption } from "@/features/git"
import { GitWorktreeCommandMenu } from "@/features/git"
import { projectApi } from "@/features/project/api/projectApi"
import { usePromptHistory } from "../hooks/usePromptHistory"
import {
  type AgentInputCommand,
  AgentInputCommandPanel,
  AgentInputFilePanel,
  type AgentInputModel,
  AgentInputModelPanel,
  getAgentPanelPosition,
} from "./AgentInputCommandPanels"
import { type AgentInputFile, AgentInputFiles } from "./AgentInputFiles"
import { AgentModelSelect, type AgentModelSelectProps } from "./AgentModelSelect"

interface AgentInputProps {
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
  // options.delivery 标记即时插话；内容由 useAgentChat 从输入框读取并统一剥离 /steer 前缀。
  onSend: (options?: { delivery?: "queue" | "steer" }) => void
  onStop: () => void
  onClear: () => void
  onUndo: () => void
  onCompact: () => void
  selectedModel: string
  onModelChange: (value: string) => void
  modelOptions: AgentModelSelectProps["options"]
  hasModelOptions: boolean
  // 外部输入框引用（父级用于建议问题回显聚焦），与内部 ref 合并。
  inputTextareaRef?: React.Ref<HTMLTextAreaElement>
  projectId?: string
  projectPath?: string
  currentPath?: string
  // git 工作区选项（/gitWorktree 二级面板；null = 无 git 上下文或非 git 仓库）。
  worktreeOptions: GitWorktreeOption[] | null
  // 选中工作区后的切换回调（参数为目标工作区根目录绝对路径）。
  onWorktreeSelect: (path: string) => void
  selectedFiles: AgentInputFile[]
  onFilesChange: (files: AgentInputFile[]) => void
  supportsImages: boolean
}

const INPUT_COMMANDS: AgentInputCommand[] = [
  { id: "clear", name: "/clear", description: "清空当前对话" },
  { id: "undo", name: "/undo", description: "撤销上一轮对话" },
  { id: "steer", name: "/steer", description: "即时插话（引导运行中 Agent 转向）" },
  { id: "model", name: "/model", description: "切换 AI 模型" },
  { id: "gitWorktree", name: "/gitWorktree", description: "切换 git 工作区" },
  { id: "compact", name: "/compact", description: "压缩当前会话上下文" },
]

const isFuzzyMatch = (query: string, keyword: string): boolean => {
  if (!query) return true
  let queryIndex = 0
  for (const character of keyword) {
    if (character === query[queryIndex]) queryIndex += 1
    if (queryIndex === query.length) return true
  }
  return false
}

const getMatchedCommands = (value: string): AgentInputCommand[] => {
  if (!value.startsWith("/") || /\s/.test(value)) return []
  const query = value.slice(1).toLowerCase()
  return INPUT_COMMANDS.filter((command) => {
    const aliases = command.id === "clear" ? ["clear", "new"] : [command.id]
    return aliases.some((alias) => isFuzzyMatch(query, alias))
  })
}

const getMentionQuery = (
  value: string,
  cursor: number,
): { start: number; query: string } | null => {
  const beforeCursor = value.slice(0, cursor)
  const start = beforeCursor.lastIndexOf("@")
  if (start < 0 || (start > 0 && !/\s/.test(beforeCursor[start - 1] ?? ""))) return null
  const query = value.slice(start + 1, cursor)
  if (/[\s\n]/.test(query)) return null
  return { start, query }
}

// 光标是否位于首行（历史浏览只在首行触发行首/空的 ↑）。
const isOnFirstLine = (cursor: number, text: string): boolean => {
  const firstLineBreak = text.indexOf("\n")
  return firstLineBreak === -1 || cursor <= firstLineBreak
}

// 光标是否位于某行第 0 列（行首）。
const isAtLineStart = (cursor: number, text: string): boolean =>
  cursor === 0 || (cursor > 0 && text[cursor - 1] === "\n")

// 光标是否位于末行（历史浏览时 ↓ 只在末行退出/前进）。
const isOnLastLine = (cursor: number, text: string): boolean => {
  const lastLineBreak = text.lastIndexOf("\n")
  return lastLineBreak === -1 || cursor > lastLineBreak
}

/**
 * Agent 聊天底栏输入框组件。
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
  currentPath,
  worktreeOptions,
  onWorktreeSelect,
  selectedFiles,
  onFilesChange,
  supportsImages,
}: AgentInputProps): React.JSX.Element => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { error: errorToast, warning: warningToast } = useLxToast()

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
  // 合并内部 ref 与外部 ref，父级可聚焦/回显输入框。
  const mergedTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null): void => {
      textareaRef.current = node
      if (typeof inputTextareaRef === "function") {
        inputTextareaRef(node)
      } else if (inputTextareaRef) {
        inputTextareaRef.current = node
      }
    },
    [inputTextareaRef],
  )
  const [panelPosition, setPanelPosition] = useState<CSSProperties | null>(null)
  const [commandIndex, setCommandIndex] = useState(0)
  const [fileIndex, setFileIndex] = useState(0)
  const [modelIndex, setModelIndex] = useState(0)
  const [worktreeIndex, setWorktreeIndex] = useState(0)
  const [files, setFiles] = useState<ProjectFileEntry[]>([])
  const [activeMode, setActiveMode] = useState<"command" | "file" | "model" | "worktree" | null>(
    null,
  )
  // 历史提示词浏览（全局共享；无面板模式时 ↑↓ 触发）。
  const { browsing, record, reset, navigate } = usePromptHistory()
  const matchedCommands = useMemo(() => getMatchedCommands(inputText), [inputText])
  const matchedModels = useMemo<AgentInputModel[]>(() => {
    if (!inputText.startsWith("/model")) return []
    const query = inputText.slice("/model".length).trim().toLowerCase()
    return modelOptions
      .flatMap((group) => {
        if ("options" in group) {
          return group.options.map((option) => ({
            id: option.value,
            label: option.label,
            provider: group.label,
          }))
        }
        return [{ id: group.value, label: group.label, provider: "" }]
      })
      .filter((model) => !query || `${model.label} ${model.provider}`.toLowerCase().includes(query))
  }, [inputText, modelOptions])
  const matchedWorktrees = useMemo<GitWorktreeOption[]>(() => {
    if (!worktreeOptions || worktreeOptions.length === 0 || !inputText.startsWith("/gitWorktree"))
      return []
    const query = inputText.slice("/gitWorktree".length).trim().toLowerCase()
    return worktreeOptions.filter(
      (option) =>
        !query ||
        option.name.toLowerCase().includes(query) ||
        option.path.toLowerCase().includes(query),
    )
  }, [inputText, worktreeOptions])
  const isCommandMode = activeMode === "command" && matchedCommands.length > 0
  const isFileMode = activeMode === "file" && files.length > 0
  const isModelMode = activeMode === "model" && matchedModels.length > 0
  const isWorktreeMode = activeMode === "worktree" && matchedWorktrees.length > 0

  useLayoutEffect(() => {
    const update = (): void => {
      const container = containerRef.current
      if (!container) {
        setPanelPosition(null)
        return
      }
      const kind: "command" | "file" | null = isFileMode
        ? "file"
        : isCommandMode || isModelMode || isWorktreeMode
          ? "command"
          : null
      if (!kind) {
        setPanelPosition(null)
        return
      }
      setPanelPosition(getAgentPanelPosition(kind, container.getBoundingClientRect()))
    }

    let frameId: number | null = null
    const scheduleUpdate = (): void => {
      if (frameId !== null) return
      frameId = requestAnimationFrame(() => {
        frameId = null
        update()
      })
    }

    update()
    const container = containerRef.current
    if (!container) return
    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(container)
    const viewport = window.visualViewport
    window.addEventListener("resize", scheduleUpdate)
    viewport?.addEventListener("resize", scheduleUpdate)
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      window.removeEventListener("resize", scheduleUpdate)
      viewport?.removeEventListener("resize", scheduleUpdate)
    }
  }, [isCommandMode, isFileMode, isModelMode, isWorktreeMode])

  useEffect(() => {
    if (activeMode !== "file") {
      setFiles([])
      return
    }
    const cursor = textareaRef.current?.selectionStart ?? inputText.length
    const mention = getMentionQuery(inputText, cursor)
    if (!mention) return
    let current = true

    const fetchPromise = projectId
      ? projectApi.searchFiles(projectId, mention.query)
      : currentPath
        ? projectApi.searchDirectoryFiles(currentPath, mention.query)
        : Promise.resolve([])

    void fetchPromise
      .then((results) => {
        if (current) setFiles(results)
      })
      .catch(() => {
        if (current) setFiles([])
      })
    return () => {
      current = false
    }
  }, [inputText, activeMode, projectId, currentPath])

  const refreshPanels = useCallback(
    (value: string, cursor: number): void => {
      const isModelInput = value === "/model" || value.startsWith("/model ")
      if (isModelInput) {
        setActiveMode("model")
        setModelIndex(0)
        setFiles([])
        return
      }

      const isWorktreeInput = value === "/gitWorktree" || value.startsWith("/gitWorktree ")
      if (isWorktreeInput) {
        setActiveMode("worktree")
        setWorktreeIndex(0)
        setFiles([])
        return
      }

      const commands = getMatchedCommands(value)
      if (commands.length > 0) {
        setActiveMode("command")
        setCommandIndex(0)
        setFiles([])
        return
      }
      if (!projectId && !currentPath) {
        setActiveMode(null)
        setFiles([])
        return
      }
      const mention = getMentionQuery(value, cursor)
      setActiveMode(mention ? "file" : null)
      setFileIndex(0)
    },
    [projectId, currentPath],
  )

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const value = event.target.value
    onInputChange(value)
    refreshPanels(value, event.target.selectionStart)
  }

  const isSteerOnly = inputText.trim() === "/steer"
  const canSend = (!isSteerOnly && inputText.trim().length > 0) || selectedFiles.length > 0

  // Esc 停止生成的连按计时（间隔 ≤1s 视为双击）；单按仅 toast 提示，不打断。
  const escStopRef = useRef(0)

  // 发送即时插话后的顶部瞬时提示条（参考排队消息提示；数秒后自动消失）。
  const [steerNoticeVisible, setSteerNoticeVisible] = useState(false)
  const steerNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // 流式输出期间 Enter 默认排队发送；Shift+Enter 或以 /steer 开头执行即时插话。
  // 内容不在组件内透传，由 useAgentChat 统一剥离 /steer 前缀（保证气泡/模型只看到内容）。
  const handleSend = (forceDelivery?: "queue" | "steer"): void => {
    reset()
    let text = inputText.trim()
    if (!text) return

    let delivery = forceDelivery
    if (text.startsWith("/steer ") || text === "/steer") {
      delivery = "steer"
      text = text.slice(6).trim()
      if (!text) return
    }

    if (delivery === "steer") {
      // 即时插话（steer）不写入历史提示词。
      showSteerNotice()
      onSend({ delivery })
    } else {
      record(text || inputText)
      onSend()
    }
  }

  const executeCommand = (command: AgentInputCommand): void => {
    setActiveMode(null)
    // 流式中 /clear 可执行（createNewChat 会 stopStreaming 中止 run 并清空队列）；/undo 与 /compact 由 hook 侧 isStreaming 守卫兜底。
    if (command.id === "clear") {
      onInputChange("")
      onClear()
    } else if (command.id === "undo") {
      onUndo()
    } else if (command.id === "steer") {
      onInputChange("/steer ")
    } else if (command.id === "model") {
      onInputChange("/model ")
    } else if (command.id === "gitWorktree") {
      onInputChange("/gitWorktree ")
    } else {
      // /compact 直接触发：清空输入（对齐 /clear /undo，不残留文本被误发送/记录历史）。
      onInputChange("")
      onCompact()
    }
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const selectWorktree = (option: GitWorktreeOption): void => {
    onWorktreeSelect(option.path)
    onInputChange("")
    setActiveMode(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const selectFile = (file: ProjectFileEntry): void => {
    const cursor = textareaRef.current?.selectionStart ?? inputText.length
    const mention = getMentionQuery(inputText, cursor)
    if (!mention) return
    const nextValue = `${inputText.slice(0, mention.start)}@${file.path} ${inputText.slice(cursor)}`
    const nextCursor = mention.start + file.path.length + 2
    onInputChange(nextValue)
    setActiveMode(null)
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
      textareaRef.current?.focus()
    })
  }

  const selectModel = (model: AgentInputModel): void => {
    onModelChange(model.id)
    onInputChange("")
    setActiveMode(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (isCommandMode) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        setCommandIndex((index) => {
          const offset = event.key === "ArrowDown" ? 1 : -1
          return (index + offset + matchedCommands.length) % matchedCommands.length
        })
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setActiveMode(null)
        return
      }
      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
        event.preventDefault()
        const command = matchedCommands[commandIndex] ?? matchedCommands[0]
        if (command) executeCommand(command)
        return
      }
    }

    if (isModelMode) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        setModelIndex((index) => {
          const offset = event.key === "ArrowDown" ? 1 : -1
          return (index + offset + matchedModels.length) % matchedModels.length
        })
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setActiveMode(null)
        return
      }
      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
        event.preventDefault()
        const model = matchedModels[modelIndex] ?? matchedModels[0]
        if (model) selectModel(model)
        return
      }
    }

    if (isWorktreeMode) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        setWorktreeIndex((index) => {
          const offset = event.key === "ArrowDown" ? 1 : -1
          return (index + offset + matchedWorktrees.length) % matchedWorktrees.length
        })
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setActiveMode(null)
        return
      }
      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
        event.preventDefault()
        const option = matchedWorktrees[worktreeIndex] ?? matchedWorktrees[0]
        if (option) selectWorktree(option)
        return
      }
    }

    if (event.key === "Backspace" && !isFileMode) {
      const cursor = textareaRef.current
      if (cursor && cursor.selectionStart === cursor.selectionEnd) {
        const tokenMatch = /(^|\s)(@[^\s]+) $/.exec(inputText.slice(0, cursor.selectionStart))
        if (tokenMatch) {
          event.preventDefault()
          const start = cursor.selectionStart - tokenMatch[0].length + tokenMatch[1].length
          onInputChange(`${inputText.slice(0, start)}${inputText.slice(cursor.selectionStart)}`)
          requestAnimationFrame(() => {
            textareaRef.current?.focus()
            textareaRef.current?.setSelectionRange(start, start)
          })
          return
        }
      }
    }

    if (isFileMode) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        setFileIndex((index) => {
          const offset = event.key === "ArrowDown" ? 1 : -1
          return (index + offset + files.length) % files.length
        })
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setActiveMode(null)
        return
      }
      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
        event.preventDefault()
        const file = files[fileIndex] ?? files[0]
        if (file) selectFile(file)
        return
      }
    }

    // 历史提示词浏览（pi 风格）：↑ 在首行行首（或空/浏览中）进入历史，↓ 在末行退出/前进；未命中放行默认光标行为。
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const cursor = textareaRef.current?.selectionStart ?? inputText.length
      const direction = event.key === "ArrowUp" ? "up" : "down"
      const atLineStart = isAtLineStart(cursor, inputText)
      const canUp =
        isOnFirstLine(cursor, inputText) && (inputText.length === 0 || browsing || atLineStart)
      const canDown = browsing && isOnLastLine(cursor, inputText)
      if ((direction === "up" && canUp) || (direction === "down" && canDown)) {
        const result = navigate(direction, inputText)
        if (result) {
          event.preventDefault()
          onInputChange(result.text)
          requestAnimationFrame(() => {
            const textarea = textareaRef.current
            if (!textarea) return
            const nextCursor = result.cursor === "start" ? 0 : result.text.length
            textarea.setSelectionRange(nextCursor, nextCursor)
            textarea.focus()
          })
          return
        }
      }
    }

    // Esc 分级打断机制：
    // ① 补全/提及/命令面板激活态：Esc 关闭面板（已在上面各个 isXMode 中 return）
    // ② 若有输入草稿文本：Esc 清空草稿
    // ③ 若输入为空且正在生成 (isStreaming)：双击 Esc 才触发 onStop；单按仅 toast 提示。
    if (event.key === "Escape") {
      if (inputText.trim().length > 0 || selectedFiles.length > 0) {
        event.preventDefault()
        onInputChange("")
        onFilesChange([])
        return
      }
      if (isStreaming) {
        event.preventDefault()
        const now = Date.now()
        if (escStopRef.current !== 0 && now - escStopRef.current <= 1000) {
          escStopRef.current = 0
          onStop()
        } else {
          escStopRef.current = now
          warningToast("再次按 Esc 可停止生成")
        }
        return
      }
    }

    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      if (event.shiftKey) {
        // Shift+Enter 在流式生成中触发 Steer 即时插话；非流式中作为普通换行
        if (isStreaming) {
          event.preventDefault()
          handleSend("steer")
        }
      } else {
        // 普通 Enter：流式中排队发送 (queue)，非流式中普通发送
        event.preventDefault()
        handleSend()
      }
    }
  }

  const handleContainerPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement
    if (target.closest("button") || target.closest("textarea")) return
    event.preventDefault()
    textareaRef.current?.focus()
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
      title={{ content: "停止生成 (Esc)", placement: "top" }}
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
      onClick={() => handleSend()}
      disabled={!canSend}
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
      {/* 即时插话提示：发送 steer 后短暂展示（参考排队消息提示条）。 */}
      {steerNoticeVisible && (
        <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-amber-400/90">
          <Zap className="h-3 w-3 shrink-0" />
          <span className="truncate">已发送即时插话，将在当前步骤完成后生效</span>
        </div>
      )}
      <AgentInputFiles files={selectedFiles} onRemove={handleRemoveFile} />
      <div
        ref={containerRef}
        className="relative flex flex-col justify-between rounded-[6px] border border-white/10 bg-[#2a2a2a] px-2.5 pt-2 pb-2 shadow-sm transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/10"
        onPointerDown={handleContainerPointerDown}
      >
        <>
          <AgentInputCommandPanel
            isOpen={isCommandMode}
            position={panelPosition}
            commands={matchedCommands}
            activeIndex={commandIndex}
          />
          <AgentInputModelPanel
            isOpen={isModelMode}
            position={panelPosition}
            models={matchedModels}
            activeIndex={modelIndex}
          />
          <GitWorktreeCommandMenu
            visible={isWorktreeMode}
            position={panelPosition ?? undefined}
            options={matchedWorktrees}
            activeIndex={worktreeIndex}
          />
          <AgentInputFilePanel
            isOpen={isFileMode}
            position={panelPosition}
            files={files}
            activeIndex={fileIndex}
          />
        </>
        <textarea
          ref={mergedTextareaRef}
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? "排队发送 (Enter) · 即时插话 (Shift+Enter 或 /steer)"
              : "给 LX Agent 发送消息..."
          }
          rows={2}
          className="min-h-[44px] max-h-[124px] w-full resize-none overflow-y-auto bg-transparent px-1 py-0.5 text-[12px] leading-[20px] text-white/90 placeholder-white/35 focus:outline-none [field-sizing:content]"
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
          <div>{actionButton}</div>
        </div>
      </div>
    </div>
  )
}
