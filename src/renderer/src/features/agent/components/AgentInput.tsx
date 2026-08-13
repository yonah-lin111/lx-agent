import type { PermissionRequest, TodoList } from "@shared/contracts/agent"
import type { ProjectFileEntry } from "@shared/project"
import { Send, ShieldAlert, Square } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
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
import { AgentModelSelect, type AgentModelSelectProps } from "./AgentModelSelect"
import {
  PERMISSION_CONFIRM_OPTIONS,
  PERMISSION_SELECT_OPTIONS,
  type PermissionPanelPhase,
  PermissionRequestPanel,
} from "./PermissionRequestPanel"
import { TodoDock, TodoDockButton } from "./TodoDock"

interface AgentInputProps {
  inputText: string
  isStreaming: boolean
  onInputChange: (text: string) => void
  onSend: () => void
  onStop: () => void
  onClear: () => void
  onUndo: () => void
  selectedModel: string
  onModelChange: (value: string) => void
  modelOptions: AgentModelSelectProps["options"]
  hasModelOptions: boolean
  // 外部输入框引用（父级用于建议问题回显聚焦），与内部 ref 合并。
  inputTextareaRef?: React.Ref<HTMLTextAreaElement>
  projectId?: string
  projectPath?: string
  // 挂起的权限请求（非空时权限面板独占键盘）。
  pendingRequest: PermissionRequest | null
  // 任务清单（模型经 todowrite 维护；驱动输入框上方 TodoDock 浮层）。
  todos: TodoList
  onPermissionRespond: (
    decision: "allow" | "deny",
    rememberForSession?: boolean,
    allowAll?: boolean,
    permanent?: boolean,
  ) => void
  // git 工作区选项（/gitWorktree 二级面板；null = 无 git 上下文或非 git 仓库）。
  worktreeOptions: GitWorktreeOption[] | null
  // 选中工作区后的切换回调（参数为目标工作区根目录绝对路径）。
  onWorktreeSelect: (path: string) => void
}

const INPUT_COMMANDS: AgentInputCommand[] = [
  { id: "clear", name: "/clear", description: "清空当前对话" },
  { id: "undo", name: "/undo", description: "撤销上一轮对话" },
  { id: "model", name: "/model", description: "切换 AI 模型" },
  { id: "gitWorktree", name: "/gitWorktree", description: "切换 git 工作区" },
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
  onInputChange,
  onSend,
  onStop,
  onClear,
  onUndo,
  selectedModel,
  onModelChange,
  modelOptions,
  hasModelOptions,
  inputTextareaRef,
  projectId,
  projectPath,
  pendingRequest,
  todos,
  onPermissionRespond,
  worktreeOptions,
  onWorktreeSelect,
}: AgentInputProps): React.JSX.Element => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
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
  // 右上角浮层定位：输入框容器上方（bottom 对齐输入框顶部），供图标栏与展开面板共用。
  const [dockPosition, setDockPosition] = useState<CSSProperties | null>(null)
  const [commandIndex, setCommandIndex] = useState(0)
  const [fileIndex, setFileIndex] = useState(0)
  const [modelIndex, setModelIndex] = useState(0)
  const [worktreeIndex, setWorktreeIndex] = useState(0)
  const [files, setFiles] = useState<ProjectFileEntry[]>([])
  const [activeMode, setActiveMode] = useState<"command" | "file" | "model" | "worktree" | null>(
    null,
  )
  // 权限面板状态：选择态 → 确认态（允许全部二次确认）。
  const [permissionPhase, setPermissionPhase] = useState<PermissionPanelPhase>("select")
  const [permissionIndex, setPermissionIndex] = useState(0)
  const [permissionKeyboardNavigationVersion, setPermissionKeyboardNavigationVersion] = useState(0)
  // 面板折叠态（仅当前请求记忆）：折叠后键盘决策降级。
  const [permissionCollapsed, setPermissionCollapsed] = useState(false)
  // 任务清单展开态：折叠时由右上角图标栏的 TodoDockButton 承载。
  const [todoExpanded, setTodoExpanded] = useState(false)
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
  // 权限请求挂起时面板独占键盘与其他面板。
  const isPermissionMode = pendingRequest != null
  // 右上角图标栏成员（右对齐，条件渲染自动右对齐收缩；后续新增图标在此追加）。
  const showTodoCapsule = todos.length > 0 && !todoExpanded
  const showPermissionShield = isPermissionMode && permissionCollapsed

  useLayoutEffect(() => {
    const update = (): void => {
      const container = containerRef.current
      if (!container) {
        setPanelPosition(null)
        return
      }
      const kind: "command" | "file" | null = isPermissionMode
        ? "command"
        : isFileMode
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
  }, [isPermissionMode, isCommandMode, isFileMode, isModelMode, isWorktreeMode])

  // TodoDock 定位（独立于输入模式）：容器上方 bottom 对齐，left/width 取容器（宽度由 TodoDock 决定是否全宽）。
  useLayoutEffect(() => {
    const update = (): void => {
      const container = containerRef.current
      if (!container) {
        setDockPosition(null)
        return
      }
      const rect = container.getBoundingClientRect()
      const offset = 6
      setDockPosition({
        left: Math.max(rect.left, 8),
        width: rect.width,
        top: "auto",
        bottom: window.innerHeight - rect.top + offset,
        maxHeight: Math.max(rect.top - offset - 8, 0),
      })
    }

    update()
    const container = containerRef.current
    if (!container) return
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(container)
    const viewport = window.visualViewport
    window.addEventListener("resize", update)
    viewport?.addEventListener("resize", update)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", update)
      viewport?.removeEventListener("resize", update)
    }
  }, [])

  useEffect(() => {
    if (!projectId || !projectPath || activeMode !== "file") {
      setFiles([])
      return
    }
    const cursor = textareaRef.current?.selectionStart ?? inputText.length
    const mention = getMentionQuery(inputText, cursor)
    if (!mention) return
    let current = true
    void projectApi
      .searchFiles(projectId, mention.query)
      .then((results) => {
        if (current) setFiles(results)
      })
      .catch(() => {
        if (current) setFiles([])
      })
    return () => {
      current = false
    }
  }, [inputText, activeMode, projectId, projectPath])

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
      if (!projectId || !projectPath) {
        setActiveMode(null)
        setFiles([])
        return
      }
      const mention = getMentionQuery(value, cursor)
      setActiveMode(mention ? "file" : null)
      setFileIndex(0)
    },
    [projectId, projectPath],
  )

  // 权限请求变化时重置面板为选择态（新请求重新开始），并复位折叠。
  useEffect(() => {
    setPermissionPhase("select")
    setPermissionIndex(0)
    setPermissionKeyboardNavigationVersion(0)
    setPermissionCollapsed(false)
  }, [pendingRequest])

  // 处理权限面板选中项：选择态六选项 / 确认态两选项。
  const handlePermissionAction = (index: number): void => {
    if (permissionPhase === "select") {
      if (index === 0) {
        onPermissionRespond("allow")
      } else if (index === 1) {
        onPermissionRespond("allow", true)
      } else if (index === 2) {
        onPermissionRespond("allow", false, false, true) // 永久允许：写回配置，直接发送
      } else if (index === 3) {
        onPermissionRespond("deny")
      } else if (index === 4) {
        onPermissionRespond("deny", false, false, true) // 永久拒绝：写回配置，直接发送
      } else {
        setPermissionPhase("confirm")
        setPermissionIndex(1) // 默认停在"返回"
      }
    } else if (index === 0) {
      onPermissionRespond("allow", false, true) // 允许全部
    } else {
      setPermissionPhase("select")
      setPermissionIndex(5) // 返回选择，保留"允许全部"高亮
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const value = event.target.value
    onInputChange(value)
    refreshPanels(value, event.target.selectionStart)
  }

  // 发送前记录历史提示词（仅输入框发送路径），并退出历史浏览。
  const handleSend = (): void => {
    reset()
    if (!inputText.trim() || isStreaming) return
    record(inputText)
    onSend()
  }

  const executeCommand = (command: AgentInputCommand): void => {
    setActiveMode(null)
    if (isStreaming) return
    if (command.id === "clear") {
      onInputChange("")
      onClear()
    } else if (command.id === "undo") {
      onUndo()
    } else if (command.id === "model") {
      onInputChange("/model ")
    } else {
      onInputChange("/gitWorktree ")
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
    // 权限面板独占键盘：↑↓ 循环选择、Enter 选中（不发送消息）、Esc 拒绝关闭。
    if (isPermissionMode) {
      // 折叠态键盘降级：不决策（防误触），Esc 仍拒绝关闭，Enter/↑↓ 拦截避免误发消息或移动光标。
      if (permissionCollapsed) {
        if (event.key === "Escape") {
          event.preventDefault()
          onPermissionRespond("deny")
        } else if (event.key === "Enter" || event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault()
        }
        return
      }
      const options =
        permissionPhase === "select" ? PERMISSION_SELECT_OPTIONS : PERMISSION_CONFIRM_OPTIONS
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        setPermissionIndex((index) => {
          const offset = event.key === "ArrowDown" ? 1 : -1
          return (index + offset + options.length) % options.length
        })
        setPermissionKeyboardNavigationVersion((version) => version + 1)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        onPermissionRespond("deny")
        return
      }
      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
        event.preventDefault()
        handlePermissionAction(permissionIndex)
        return
      }
    }

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

    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      handleSend()
    }
  }

  const handleContainerPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement
    if (target.closest("button") || target.closest("textarea")) return
    event.preventDefault()
    textareaRef.current?.focus()
  }

  const addButton = (
    <LxIconButton
      shape="circle"
      preset="add"
      aria-label="添加附件"
      title={{ content: "添加附件", placement: "top" }}
      hoverBgClass="hover:bg-white/20"
      hoverTextClass="hover:text-white"
      className="bg-white/10 !text-white/70"
    />
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
  ) : (
    <LxIconButton
      shape="circle"
      aria-label="发送消息"
      title={{ content: "发送消息 (Enter)", placement: "top" }}
      onClick={handleSend}
      disabled={!inputText.trim()}
      hoverBgClass="hover:bg-white/90"
      className="bg-white !text-black shadow-sm disabled:!bg-white/15 disabled:!text-white/30 disabled:!opacity-100 disabled:shadow-none"
    >
      <Send className="h-3.5 w-3.5" />
    </LxIconButton>
  )

  return (
    <div className="bg-transparent p-0.5 pt-1 pb-0">
      <div
        ref={containerRef}
        className="relative flex flex-col justify-between rounded-[6px] border border-white/10 bg-[#2a2a2a] px-2.5 pt-2 pb-2 shadow-sm transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/10"
        onPointerDown={handleContainerPointerDown}
      >
        {isPermissionMode && pendingRequest ? (
          <PermissionRequestPanel
            isOpen={isPermissionMode}
            position={panelPosition}
            request={pendingRequest}
            phase={permissionPhase}
            options={
              permissionPhase === "select" ? PERMISSION_SELECT_OPTIONS : PERMISSION_CONFIRM_OPTIONS
            }
            activeIndex={permissionIndex}
            isCollapsed={permissionCollapsed}
            keyboardNavigationVersion={permissionKeyboardNavigationVersion}
            onToggleCollapse={() => setPermissionCollapsed((collapsed) => !collapsed)}
            onHoverIndex={setPermissionIndex}
            onSelect={handlePermissionAction}
          />
        ) : (
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
        )}
        {/* 任务清单展开面板：输入框上方全宽（折叠态由下方图标栏的 TodoDockButton 承载）。 */}
        <TodoDock
          todos={todos}
          position={dockPosition}
          expanded={todoExpanded}
          onToggleExpanded={setTodoExpanded}
        />
        {/* 右上角图标栏：todo/权限等折叠 icon 共享容器，右对齐；成员条件渲染自动右对齐收缩（如 c b a → c b）。 */}
        {dockPosition && (showTodoCapsule || showPermissionShield) && (
          <div
            aria-label="浮动图标栏"
            className="pointer-events-none fixed z-30 flex h-7 items-center justify-end gap-1.5 px-2"
            style={{ ...dockPosition, overflow: "hidden" }}
          >
            <TodoDockButton todos={todos} onClick={() => setTodoExpanded(true)} />
            {showPermissionShield && (
              <LxIconButton
                shape="circle"
                aria-label="展开权限确认"
                title={{ content: "展开权限面板", placement: "top" }}
                className="pointer-events-auto border border-white/10 bg-[#303030] !text-amber-300"
                hoverBgClass="hover:bg-[#3a3a3a]"
                hoverTextClass="hover:text-amber-300"
                onClick={() => setPermissionCollapsed(false)}
              >
                <ShieldAlert className="h-4 w-4" />
              </LxIconButton>
            )}
          </div>
        )}
        <textarea
          ref={mergedTextareaRef}
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="给 LX Agent 发送消息..."
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
