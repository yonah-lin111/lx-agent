import type { ProjectFileEntry } from "@shared/project"
import { FileText, Folder } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { LxTag } from "@/components/ui/LxTag"
import { getMentionDirectoryTag } from "@/features/project/utils"

export interface AgentInputCommand {
  id: "clear" | "undo" | "model" | "gitWorktree" | "compact"
  name: string
  description: string
}

export interface AgentInputModel {
  id: string
  label: string
  provider: string
}

type AgentPanelKind = "command" | "file"

interface AgentInputModelPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  models: AgentInputModel[]
  activeIndex: number
}

interface AgentInputCommandPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  commands: AgentInputCommand[]
  activeIndex: number
}

interface AgentInputFilePanelProps {
  isOpen: boolean
  position: CSSProperties | null
  files: ProjectFileEntry[]
  activeIndex: number
}

const panelClassName =
  "scrollbar-hidden pointer-events-none fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)]"

/**
 * 面板淡入/淡出动画：关闭后保留最后数据渲染 120ms 播放退场动画，
 * 与 MarkdownBlockCommandMenu / GitWorktreeCommandMenu 一致的过渡体验。
 */
const usePanelAnimation = <T,>(
  visible: boolean,
  data: T | null,
): { displayData: T; isAnimatingOut: boolean } | null => {
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  const lastDataRef = useRef<T | null>(null)
  if (visible && data) lastDataRef.current = data

  useEffect(() => {
    if (visible) {
      setShouldRender(true)
      setIsAnimatingOut(false)
      return
    }
    if (!shouldRender) return

    setIsAnimatingOut(true)
    const timer = setTimeout(() => {
      setShouldRender(false)
      setIsAnimatingOut(false)
    }, 120)
    return () => clearTimeout(timer)
  }, [visible, shouldRender])

  if (!shouldRender) return null
  const displayData = (visible && data ? data : lastDataRef.current) as T | null
  if (!displayData) return null
  return { displayData, isAnimatingOut }
}

/**
 * 读取 CSS 变量中的尺寸（支持 px/rem/vh/vw）换算为像素。
 */
const getCssDimensionInPixels = (variableName: string): number => {
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()
  const value = Number.parseFloat(cssValue)
  if (!Number.isFinite(value)) return 0

  if (cssValue.endsWith("rem")) {
    return value * Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  }
  if (cssValue.endsWith("vh")) return (value / 100) * window.innerHeight
  if (cssValue.endsWith("vw")) return (value / 100) * window.innerWidth

  return value
}

/**
 * 根据输入框容器位置计算面板在视口内的位置：下方空间不足时向上翻转，
 * 空间都不足时收窄最大高度，保证面板完整可见。
 */
export const getAgentPanelPosition = (kind: AgentPanelKind, rect: DOMRect): CSSProperties => {
  const maxHeight = getCssDimensionInPixels(
    kind === "file"
      ? "--agent-input-file-menu-max-height"
      : "--agent-input-command-menu-max-height",
  )
  const offset = 6
  const left = Math.min(Math.max(rect.left, 8), Math.max(window.innerWidth - rect.width - 8, 8))
  const horizontal = { left, width: rect.width }

  const spaceBelow = window.innerHeight - rect.bottom
  if (spaceBelow >= maxHeight) {
    return { ...horizontal, maxHeight, top: rect.bottom + offset, bottom: "auto" }
  }

  const aboveMaxHeight = Math.min(maxHeight, Math.max(rect.top - offset - 8, 0))
  if (aboveMaxHeight > 0) {
    return {
      ...horizontal,
      maxHeight: aboveMaxHeight,
      top: "auto",
      bottom: window.innerHeight - rect.top + offset,
    }
  }

  return {
    ...horizontal,
    maxHeight: Math.max(spaceBelow - offset - 8, 0),
    top: rect.bottom + offset,
    bottom: "auto",
  }
}

/**
 * 激活项与面板边缘保持间距，避免上下键移动时被裁切。
 */
const useActiveItemScrollIntoView = (
  isOpen: boolean,
  position: CSSProperties | null,
  activeIndex: number,
): React.RefObject<HTMLDivElement | null> => {
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!isOpen || !position) return
    const container = panelRef.current
    if (!container) return

    const activeElement = container.querySelector(
      `[data-index="${activeIndex}"]`,
    ) as HTMLElement | null
    if (!activeElement) return

    const scrollPadding = 4
    const containerRect = container.getBoundingClientRect()
    const activeRect = activeElement.getBoundingClientRect()

    if (activeRect.top < containerRect.top + scrollPadding) {
      container.scrollTop -= containerRect.top + scrollPadding - activeRect.top
    } else if (activeRect.bottom > containerRect.bottom - scrollPadding) {
      container.scrollTop += activeRect.bottom - (containerRect.bottom - scrollPadding)
    }
  }, [isOpen, position, activeIndex])

  return panelRef
}

/**
 * 渲染 Agent 输入框的模型选择面板。
 */
export const AgentInputModelPanel = ({
  isOpen,
  position,
  models,
  activeIndex,
}: AgentInputModelPanelProps): React.JSX.Element | null => {
  const hasData = position !== null && models.length > 0
  const animated = usePanelAnimation(
    isOpen && hasData,
    hasData ? { position, models, activeIndex } : null,
  )
  const panelRef = useActiveItemScrollIntoView(
    isOpen,
    position,
    animated?.displayData.activeIndex ?? 0,
  )
  if (!animated) return null

  const { position: displayPosition, models: displayModels, activeIndex: displayIndex } =
    animated.displayData

  return (
    <div
      ref={panelRef}
      aria-label="模型选择"
      className={`${panelClassName} ${
        animated.isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayPosition}
    >
      {displayModels.map((model, index) => (
        <div
          key={model.id}
          role="option"
          data-index={index}
          aria-selected={index === displayIndex}
          className={`flex h-11 w-full items-center gap-3 rounded-[4px] px-2 text-left text-xs ${
            index === displayIndex ? "bg-white/8 text-white" : "text-white/75"
          }`}
        >
          <span className="truncate font-medium">{model.label}</span>
          <span className="ml-auto shrink-0 text-white/35">{model.provider}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * 渲染 Agent 输入框的 Slash 命令面板。
 */
export const AgentInputCommandPanel = ({
  isOpen,
  position,
  commands,
  activeIndex,
}: AgentInputCommandPanelProps): React.JSX.Element | null => {
  const hasData = position !== null && commands.length > 0
  const animated = usePanelAnimation(
    isOpen && hasData,
    hasData ? { position, commands, activeIndex } : null,
  )
  const panelRef = useActiveItemScrollIntoView(
    isOpen,
    position,
    animated?.displayData.activeIndex ?? 0,
  )
  if (!animated) return null

  const { position: displayPosition, commands: displayCommands, activeIndex: displayIndex } =
    animated.displayData

  return (
    <div
      ref={panelRef}
      aria-label="Slash 命令"
      className={`${panelClassName} ${
        animated.isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayPosition}
    >
      {displayCommands.map((command, index) => (
        <div
          key={command.id}
          role="option"
          data-index={index}
          aria-selected={index === displayIndex}
          className={`flex h-11 w-full items-center gap-2 rounded-[4px] px-2 text-left transition-colors ${
            index === displayIndex ? "bg-white/8 text-white" : "text-white/75"
          }`}
        >
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[4px] bg-white/5 text-[13px] text-white/70">
            /
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-[13px] leading-none text-white">{command.name}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] leading-none text-white/45">
              {command.description}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * 渲染 Agent 输入框的项目文件提及面板。
 */
export const AgentInputFilePanel = ({
  isOpen,
  position,
  files,
  activeIndex,
}: AgentInputFilePanelProps): React.JSX.Element | null => {
  const hasData = position !== null && files.length > 0
  const animated = usePanelAnimation(
    isOpen && hasData,
    hasData ? { position, files, activeIndex } : null,
  )
  const panelRef = useActiveItemScrollIntoView(
    isOpen,
    position,
    animated?.displayData.activeIndex ?? 0,
  )
  if (!animated) return null

  const { position: displayPosition, files: displayFiles, activeIndex: displayIndex } =
    animated.displayData

  return (
    <div
      ref={panelRef}
      aria-label="项目文件提及"
      className={`${panelClassName} ${
        animated.isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayPosition}
    >
      {displayFiles.map((file, index) => {
        const normalizedPath = file.path.replace(/\/$/, "")
        const slashIndex = normalizedPath.lastIndexOf("/")
        const name = normalizedPath.slice(slashIndex + 1)
        const directory = slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex)
        const Icon = file.isDirectory ? Folder : FileText
        const isActive = index === displayIndex
        const directoryTag = getMentionDirectoryTag(file.path)

        return (
          <div
            key={file.path}
            role="option"
            data-index={index}
            aria-selected={isActive}
            className={`flex min-h-11 w-full items-center gap-2 rounded-[4px] px-2 py-1 text-left text-xs transition-colors ${
              isActive ? "bg-white/8 text-white" : "text-white/75"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0 text-[#eab308]" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className={`min-w-0 flex-1 truncate ${isActive ? "text-white" : "text-white/75"}`}
                >
                  {file.isDirectory ? `${name}/` : name}
                </span>
                {directoryTag && (
                  <LxTag
                    bgClass={directoryTag.bgClass}
                    className="pointer-events-none shrink-0"
                    size="small"
                  >
                    {directoryTag.label}
                  </LxTag>
                )}
              </span>
              {directory && (
                <span className="block truncate text-[12px] text-white/40">{directory}</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}