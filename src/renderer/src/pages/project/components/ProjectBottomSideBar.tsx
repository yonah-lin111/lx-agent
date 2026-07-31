import type { ProjectFileEntry } from "@shared/project"
import { FileText, Folder, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { projectApi } from "@/features/project/api/projectApi"

// 从设计内容中提取 Markdown 引用。
const getDesignReferences = (content: string): string[] => {
  const references: string[] = []
  const pattern = /@\[refer-folder\]\(([^()\r\n]+)\)/g

  let match = pattern.exec(content)
  while (match) {
    const reference = match[0]
    if (reference) references.push(reference)
    match = pattern.exec(content)
  }

  return references
}

interface ProjectBottomSideBarProps {
  isExpanded?: boolean
}

// 文件夹内容面板状态。
interface FolderContentsPanelState {
  files: ProjectFileEntry[]
  folderPath: string
  position: React.CSSProperties
}

/**
 * 渲染当前设计中的引用内容。
 */
export const ProjectBottomSideBar = ({
  isExpanded = false,
}: ProjectBottomSideBarProps): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const designId = searchParams.get("designId")
  const [content, setContent] = useState("")
  const [folderPanel, setFolderPanel] = useState<FolderContentsPanelState | null>(null)
  const [folderQuery, setFolderQuery] = useState("")
  const [isFolderLoading, setIsFolderLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let isCurrent = true

    const loadDesign = async (): Promise<void> => {
      setContent("")
      if (!designId) {
        return
      }

      try {
        const design = (await projectApi.list()).find((item) => item.id === designId)
        if (isCurrent) setContent(design?.designData ?? "")
      } catch (error) {
        if (isCurrent) setContent("")
        console.error("Failed to load design references", error)
      }
    }

    void loadDesign()
    return () => {
      isCurrent = false
    }
  }, [designId])

  useEffect(() => {
    if (!folderPanel) return
    inputRef.current?.focus()
  }, [folderPanel])

  useEffect(() => {
    if (!folderPanel) return
    let isCurrent = true
    setIsFolderLoading(true)
    void projectApi
      .searchReferencedFiles([folderPanel.folderPath], folderQuery)
      .then((files) => {
        if (isCurrent) setFolderPanel((current) => (current ? { ...current, files } : null))
      })
      .catch(() => {
        if (isCurrent) setFolderPanel((current) => (current ? { ...current, files: [] } : null))
      })
      .finally(() => {
        if (isCurrent) setIsFolderLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [folderPanel?.folderPath, folderQuery])

  useEffect(() => {
    if (!folderPanel) return
    const closePanel = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setFolderPanel(null)
    }
    document.addEventListener("keydown", closePanel)
    return () => document.removeEventListener("keydown", closePanel)
  }, [folderPanel])

  useEffect(() => {
    if (!folderPanel) return
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!panelRef.current?.contains(event.target as Node)) setFolderPanel(null)
    }
    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeOnOutsideClick)
  }, [folderPanel])

  const referencesHtml = useMemo(() => {
    const references = getDesignReferences(content)
    return references.length > 0 ? markdownRenderer.render(references.join(" ")) : ""
  }, [content])

  const openFolderPanel = useCallback((folderPath: string, event: React.MouseEvent): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    setFolderQuery("")
    setFolderPanel({
      files: [],
      folderPath,
      position: { left: rect.left, bottom: window.innerHeight - rect.top + 6 },
    })
  }, [])

  const handleReferenceClick = useCallback(
    (
      path: string,
      type: "folder" | "project" | "file" | "image" | "common",
      event: React.MouseEvent,
    ) => {
      if (type === "folder") openFolderPanel(path, event)
    },
    [openFolderPanel],
  )

  return (
    <div
      className={`absolute inset-0 min-w-0 overflow-hidden ${
        isExpanded ? "flex items-start justify-start" : "flex items-center pr-24"
      }`}
    >
      {referencesHtml && (
        <LxMarkdownPreview
          html={referencesHtml}
          previewMode="preview"
          previewRef={previewRef}
          className="min-w-0 flex-none overflow-x-auto overflow-y-hidden px-0"
          contentClassName="min-w-0 overflow-hidden py-0 [&>p]:m-0 [&>p]:flex [&>p]:min-w-0 [&>p]:flex-nowrap [&>p]:gap-1"
          onReferenceClick={handleReferenceClick}
        />
      )}
      {folderPanel && (
        <div
          ref={panelRef}
          aria-label="文件夹内容"
          className="markdown-command-menu markdown-command-menu--file fixed z-50 flex flex-col overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
          role="listbox"
          style={folderPanel.position}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isFolderLoading && <div className="px-2 py-3 text-xs text-white/45">正在加载...</div>}
            {!isFolderLoading && folderPanel.files.length === 0 && (
              <div className="px-2 py-3 text-xs text-white/45">未找到内容</div>
            )}
            {folderPanel.files.map((file) => {
              const normalizedPath = file.path.replace(/\/$/, "")
              const slashIndex = normalizedPath.lastIndexOf("/")
              const name = normalizedPath.slice(slashIndex + 1)
              const directory = slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex)
              const Icon = file.isDirectory ? Folder : FileText
              return (
                <div
                  key={file.path}
                  className="relative flex min-h-11 w-full rounded-[4px] px-2 py-1 text-left text-xs text-white/75 transition-colors hover:bg-white/8"
                  role="option"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-h-8 items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-violet-300" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{file.isDirectory ? `${name}/` : name}</div>
                        {directory && (
                          <div className="truncate text-[12px] text-white/40">{directory}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex items-center gap-2 border-t border-white/10 px-2 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-white/40" />
            <input
              ref={inputRef}
              aria-label="搜索文件夹内容"
              className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/35"
              placeholder="搜索文件夹内容"
              value={folderQuery}
              onChange={(event) => setFolderQuery(event.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
