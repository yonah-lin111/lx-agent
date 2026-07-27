import { FileText, Folder } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { useEffect, useRef } from "react"
import type { ProjectFileEntry } from "@shared/project"

// 文件提及面板属性。
interface FileMentionCommandMenuProps {
  activeIndex: number
  files: ProjectFileEntry[]
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

  useEffect(() => {
    if (!containerRef.current || !activeFile) return

    const activeElement = containerRef.current.querySelector(
      `[id="markdown-file-mention-${activeFile.path}"]`,
    ) as HTMLElement
    if (activeElement && typeof activeElement.scrollIntoView === "function") {
      activeElement.scrollIntoView({ block: "nearest" })
    }
  }, [activeFile, activeIndex])

  return (
    <div
      ref={containerRef}
      aria-label="项目文件提及"
      aria-activedescendant={`markdown-file-mention-${activeFile?.path}`}
      className="pointer-events-none fixed z-50 max-h-[30vh] w-80 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
      role="listbox"
      style={position}
    >
      {files.map((file, index) => {
        const normalizedPath = file.path.replace(/\/$/, "")
        const slashIndex = normalizedPath.lastIndexOf("/")
        const name = normalizedPath.slice(slashIndex + 1)
        const directory = slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex)
        const Icon = file.isDirectory ? Folder : FileText
        const isActive = index === activeIndex

        return (
          <div
            key={file.path}
            id={`markdown-file-mention-${file.path}`}
            aria-selected={isActive}
            className={`flex h-11 w-full items-center gap-2 rounded-[4px] px-2 text-left text-xs transition-colors ${
              isActive ? "bg-white/8 text-white" : "text-white/75"
            }`}
            role="option"
          >
            <Icon className="h-4 w-4 shrink-0 text-white/50" />
            <span className="min-w-0 flex-1">
              <span className={`block truncate ${isActive ? "text-white" : "text-white/75"}`}>
                {file.isDirectory ? `${name}/` : name}
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
