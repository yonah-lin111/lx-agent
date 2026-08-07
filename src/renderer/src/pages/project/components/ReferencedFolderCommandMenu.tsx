import type { ProjectFileEntry } from "@shared/project"
import { Check, Copy, FileText, Folder, Search } from "lucide-react"
import type React from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { LxInput } from "@/components/ui/LxInput"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { createMarkdownReference } from "@/features/markdown/commands/markdownReferenceCommands"
import { projectApi } from "@/features/project/api/projectApi"

// 文件夹命令面板属性。
interface ReferencedFolderCommandMenuProps {
  folderPath: string
  position: React.CSSProperties
  onClose: () => void
}

/**
 * 渲染共享文件夹内文件的 @ 命令面板。
 */
export const ReferencedFolderCommandMenu = ({
  folderPath,
  position,
  onClose,
}: ReferencedFolderCommandMenuProps): React.JSX.Element => {
  const [files, setFiles] = useState<ProjectFileEntry[]>([])
  const [query, setQuery] = useState("")
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [isFolderPathCopied, setIsFolderPathCopied] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const closeTimeoutRef = useRef<number | null>(null)

  const handleClose = (): void => {
    if (isAnimatingOut) return
    setIsAnimatingOut(true)
    closeTimeoutRef.current = window.setTimeout(() => {
      onClose()
    }, 120)
  }

  useEffect(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setIsAnimatingOut(false)
  }, [folderPath])

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    let isCurrent = true
    void projectApi
      .searchReferencedFiles([folderPath], query)
      .then((nextFiles) => {
        if (isCurrent) setFiles(nextFiles)
      })
      .catch(() => {
        if (isCurrent) setFiles([])
      })

    return () => {
      isCurrent = false
    }
  }, [folderPath, query])

  // 查询变化时重置高亮，避免高亮停留在旧结果上。
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  /**
   * 处理面板键盘交互：上下键切换高亮项，Ctrl/⌘+C 复制高亮项的引用。
   * 搜索框内有文本选区时保留原生复制行为。
   */
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (files.length === 0) return
      event.preventDefault()
      const offset = event.key === "ArrowDown" ? 1 : -1
      setActiveIndex((current) => (current + offset + files.length) % files.length)
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      const input = event.currentTarget
      if (input.selectionStart !== input.selectionEnd) return
      const activeFile = files[activeIndex] ?? files[0]
      if (!activeFile) return
      event.preventDefault()
      void copyReference(activeFile)
    }
  }

  /**
   * 高亮项变化时滚动列表，确保其始终完整可见。
   */
  useLayoutEffect(() => {
    const container = listRef.current
    if (!container || files.length === 0) return
    const activeElement = container.querySelector(
      `[id="folder-file-${files[activeIndex]?.path}"]`,
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
  }, [activeIndex, files])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") handleClose()
    }
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!panelRef.current?.contains(event.target as Node)) handleClose()
    }
    document.addEventListener("keydown", closeOnEscape)
    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => {
      document.removeEventListener("keydown", closeOnEscape)
      document.removeEventListener("mousedown", closeOnOutsideClick)
    }
  }, [onClose, isAnimatingOut])

  /**
   * 复制可直接粘贴进 Markdown 编辑器的引用文本。
   */
  const copyReference = async (file: ProjectFileEntry): Promise<void> => {
    await navigator.clipboard.writeText(
      createMarkdownReference(file.isDirectory ? "folder" : "file", file.path),
    )
    setCopiedPath(file.path)
    window.setTimeout(() => setCopiedPath((path) => (path === file.path ? null : path)), 1500)
  }

  /**
   * 复制文件夹物理路径。
   */
  const copyFolderPath = async (): Promise<void> => {
    await navigator.clipboard.writeText(folderPath)
    setIsFolderPathCopied(true)
    window.setTimeout(() => setIsFolderPathCopied(false), 1500)
  }

  return createPortal(
    <div
      ref={panelRef}
      aria-label="引用文件夹内容"
      className={`markdown-command-menu markdown-command-menu--file fixed z-50 flex h-[var(--markdown-command-menu-file-max-height)] w-80 flex-col overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={position}
    >
      <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5 text-xs text-white/60">
        <Folder className="h-3.5 w-3.5 shrink-0 text-[#d97706]" />
        <span
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/70 select-all"
          title={folderPath}
        >
          {folderPath}
        </span>
        <LxTooltip content={isFolderPathCopied ? "已复制" : "复制路径"} placement="top">
          <button
            aria-label="复制文件夹路径"
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
              isFolderPathCopied ? "text-emerald-400" : "text-white/40 hover:text-white/80"
            }`}
            type="button"
            onClick={() => void copyFolderPath()}
          >
            {isFolderPathCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </LxTooltip>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {files.map((file, index) => {
          const normalizedPath = file.path.replace(/\/$/, "")
          const slashIndex = normalizedPath.lastIndexOf("/")
          const name = normalizedPath.slice(slashIndex + 1)
          const directory = slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex)
          const Icon = file.isDirectory ? Folder : FileText
          const isCopied = copiedPath === file.path
          const isActive = index === activeIndex

          return (
            <div
              key={file.path}
              id={`folder-file-${file.path}`}
              aria-selected={isActive}
              className={`relative flex min-h-11 w-full items-center rounded-[4px] px-2 py-1 text-left text-xs transition-colors ${
                isActive ? "bg-white/8 text-white" : "text-white/75 hover:bg-white/8"
              }`}
              role="option"
              onMouseDown={(event) => event.preventDefault()}
            >
              <Icon className="h-4 w-4 shrink-0 text-violet-300" />
              <div className="ml-2 min-w-0 flex-1">
                <div className="truncate">{file.isDirectory ? `${name}/` : name}</div>
                {directory && <div className="truncate text-[12px] text-white/40">{directory}</div>}
              </div>
              <LxTooltip content={isCopied ? "已复制" : "复制引用"} placement="top">
                <button
                  aria-label="复制引用"
                  className={`ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] transition-colors ${
                    isCopied
                      ? "text-emerald-400"
                      : "text-white/40 hover:bg-white/8 hover:text-white/80"
                  }`}
                  type="button"
                  onClick={() => void copyReference(file)}
                >
                  {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </LxTooltip>
            </div>
          )
        })}
      </div>
      <div>
        <LxInput
          ref={inputRef}
          aria-label="搜索文件夹内容"
          placeholder="搜索文件夹内容"
          prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/40" />}
          size="xs"
          value={query}
          variant="simple"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleInputKeyDown}
        />
      </div>
    </div>,
    document.body,
  )
}
