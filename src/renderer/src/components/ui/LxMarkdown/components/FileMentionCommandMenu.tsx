import { FileText, Folder } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { useLayoutEffect, useRef } from "react"
import type { MarkdownFileMentionEntry } from "@/components/ui/LxMarkdown/types"
import { Tag } from "@/components/ui/Tag"

// 文件提及面板属性。
interface FileMentionCommandMenuProps {
  activeIndex: number
  files: MarkdownFileMentionEntry[]
  position: CSSProperties
}

/**
 * 渲染 Markdown 编辑器的项目文件 @ 命令面板。
 */
export const FileMentionCommandMenu = ({
  activeIndex,
  files,
  position,
}: FileMentionCommandMenuProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeFile = files[activeIndex] ?? files[0]

  useLayoutEffect(() => {
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
  }, [activeFile, activeIndex])

  return (
    <div
      ref={containerRef}
      aria-label="项目文件提及"
      aria-activedescendant={`markdown-file-mention-${activeFile?.source}-${activeFile?.mentionPath}`}
      className="markdown-command-menu markdown-command-menu--file pointer-events-none fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="listbox"
      style={position}
    >
      {files.map((file, index) => {
        const normalizedPath = file.path.replace(/\/$/, "")
        const slashIndex = normalizedPath.lastIndexOf("/")
        const name = normalizedPath.slice(slashIndex + 1)
        const directory = slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex)
        const referenceProjectName = file.projectPath?.split("/").filter(Boolean).at(-1)
        const Icon = file.isDirectory ? Folder : FileText
        const isActive = index === activeIndex

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
                    file.source === "reference" ? "text-violet-300" : "text-[#818cf8]"
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
                <Tag
                  bgClass="border-violet-400/20 bg-violet-400/10 text-violet-300"
                  className="pointer-events-none ml-6 mt-0.5"
                  size="small"
                >
                  {referenceProjectName ?? "refer-project"}
                </Tag>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
