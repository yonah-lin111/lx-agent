import { FileText, Folder } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { MarkdownFileMentionEntry } from "@/components/ui/LxMarkdown/types"
import { LxTag } from "@/components/ui/LxTag"

// 文件提及面板属性。
interface FileMentionCommandMenuProps {
  files?: MarkdownFileMentionEntry[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
}

/**
 * 渲染 Markdown 编辑器的项目文件 @ 命令面板。
 */
export const FileMentionCommandMenu = ({
  files,
  activeIndex = 0,
  position,
  visible = false,
}: FileMentionCommandMenuProps): React.JSX.Element | null => {
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  const lastDataRef = useRef<{
    files: MarkdownFileMentionEntry[]
    activeIndex: number
    position: CSSProperties
  } | null>(null)

  if (visible && files && position) {
    lastDataRef.current = { files, activeIndex, position }
  }

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

  const containerRef = useRef<HTMLDivElement>(null)

  const displayData =
    visible && files && position ? { files, activeIndex, position } : lastDataRef.current

  const activeFile = displayData
    ? displayData.files[displayData.activeIndex] ?? displayData.files[0]
    : null

  useLayoutEffect(() => {
    if (!shouldRender) return
    const container = containerRef.current
    if (!container || !activeFile) return

    const activeElement = container.querySelector(
      `[id="markdown-file-mention-${activeFile.source}-${activeFile.mentionPath}"]`,
    ) as HTMLElement
    if (!activeElement) return

    // 激活项与面板边缘保持间距，避免上下键移动时被裁切。
    const scrollPadding = 4
    const containerRect = container.getBoundingClientRect()
    const activeRect = activeElement.getBoundingClientRect()

    if (activeRect.top < containerRect.top + scrollPadding) {
      container.scrollTop -= containerRect.top + scrollPadding - activeRect.top
    } else if (activeRect.bottom > containerRect.bottom - scrollPadding) {
      container.scrollTop += activeRect.bottom - (containerRect.bottom - scrollPadding)
    }
  }, [activeFile, displayData?.activeIndex, shouldRender])

  if (!shouldRender || !displayData) return null

  const {
    files: displayFiles,
    activeIndex: displayActiveIndex,
    position: displayPosition,
  } = displayData

  return (
    <div
      ref={containerRef}
      aria-label="项目文件提及"
      aria-activedescendant={`markdown-file-mention-${activeFile?.source}-${activeFile?.mentionPath}`}
      className={`markdown-command-menu markdown-command-menu--file pointer-events-none fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayPosition}
    >
      {displayFiles.map((file, index) => {
        const normalizedPath = file.path.replace(/\/$/, "")
        const slashIndex = normalizedPath.lastIndexOf("/")
        const name = normalizedPath.slice(slashIndex + 1)
        const directory = slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex)
        const referenceProjectName = file.projectPath?.split("/").filter(Boolean).at(-1)
        const Icon = file.isDirectory ? Folder : FileText
        const isActive = index === displayActiveIndex

        return (
          <div
            key={`${file.source}-${file.mentionPath}`}
            id={`markdown-file-mention-${file.source}-${file.mentionPath}`}
            aria-selected={isActive}
            className={`relative flex min-h-11 w-full rounded-[4px] px-2 py-1 text-left text-xs transition-colors ${
              isActive ? "bg-white/8 text-white" : "text-white/75"
            }`}
            role="option"
          >
            <div className="min-w-0 flex-1">
              <div className="flex min-h-8 items-center gap-2">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    file.source === "reference" ? "text-violet-300" : "text-[#eab308]"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className={`truncate ${isActive ? "text-white" : "text-white/75"}`}>
                    {file.isDirectory ? `${name}/` : name}
                  </div>
                  {directory && (
                    <div className="truncate text-[12px] text-white/40">{directory}</div>
                  )}
                </div>
              </div>
              {file.source === "reference" && (
                <LxTag
                  bgClass="border-violet-400/20 bg-violet-400/10 text-violet-300"
                  className="pointer-events-none ml-6 mt-0.5"
                  size="small"
                >
                  {referenceProjectName ?? "refer-project"}
                </LxTag>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
