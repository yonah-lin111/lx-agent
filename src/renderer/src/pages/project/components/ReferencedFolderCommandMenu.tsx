import type { ProjectFileEntry } from "@shared/project"
import { Check, Copy, FileText, Folder, Search } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { LxInput } from "@/components/ui/LxInput"
import { createMarkdownReference } from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"
import { LxTooltip } from "@/components/ui/LxTooltip"
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
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
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
      className={`markdown-command-menu markdown-command-menu--file fixed z-50 flex max-h-80 w-80 flex-col overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        {files.map((file) => {
          const normalizedPath = file.path.replace(/\/$/, "")
          const slashIndex = normalizedPath.lastIndexOf("/")
          const name = normalizedPath.slice(slashIndex + 1)
          const directory = slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex)
          const Icon = file.isDirectory ? Folder : FileText
          const isCopied = copiedPath === file.path

          return (
            <div
              key={file.path}
              className="relative flex min-h-11 w-full items-center rounded-[4px] px-2 py-1 text-left text-xs text-white/75 transition-colors hover:bg-white/8"
              role="option"
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
        />
      </div>
    </div>,
    document.body,
  )
}
