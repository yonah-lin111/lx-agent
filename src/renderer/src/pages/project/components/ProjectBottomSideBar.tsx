import type { ReferencedFolder } from "@shared/project"
import { Check, Copy, Folder } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  createMarkdownReference,
  getMarkdownReferenceName,
} from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { projectApi } from "@/features/project/api/projectApi"
import { useProjectReferencedFoldersStore } from "@/features/project/referencedFoldersStore"
import { ReferencedFolderCommandMenu } from "@/pages/project/components/ReferencedFolderCommandMenu"

interface ProjectBottomSideBarProps {
  isExpanded?: boolean
}

// 防止 Zustand 选择器因返回新数组而重复渲染。
const EMPTY_REFERENCED_FOLDERS: ReferencedFolder[] = []

// 已打开的文件夹面板。
interface FolderPanelState {
  folderPath: string
  position: React.CSSProperties
}

/**
 * 渲染项目共享文件夹引用。
 */
export const ProjectBottomSideBar = ({
  isExpanded = false,
}: ProjectBottomSideBarProps): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const designId = searchParams.get("designId")
  const [projectId, setProjectId] = useState<string | null>(null)
  const [folderPanel, setFolderPanel] = useState<FolderPanelState | null>(null)
  const [copiedFolderPath, setCopiedFolderPath] = useState<string | null>(null)
  const referencedFolders = useProjectReferencedFoldersStore((state) =>
    projectId
      ? (state.foldersByProjectId[projectId] ?? EMPTY_REFERENCED_FOLDERS)
      : EMPTY_REFERENCED_FOLDERS,
  )
  const setReferencedFolders = useProjectReferencedFoldersStore(
    (state) => state.setReferencedFolders,
  )
  const sortedFolders = useMemo(
    () =>
      [...referencedFolders].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [referencedFolders],
  )

  useEffect(() => {
    let isCurrent = true

    const loadProjectReferences = async (): Promise<void> => {
      setProjectId(null)
      if (!designId) return

      try {
        const [designs, projects] = await Promise.all([
          projectApi.list(),
          projectApi.listProjects(),
        ])
        const design = designs.find((item) => item.id === designId)
        const project = projects.find((item) => item.id === design?.projectId)
        if (!isCurrent) return

        setProjectId(project?.id ?? null)
        if (project) setReferencedFolders(project.id, project.referencedFolders)
      } catch (error) {
        if (isCurrent) setProjectId(null)
        console.error("Failed to load design references", error)
      }
    }

    void loadProjectReferences()
    return () => {
      isCurrent = false
    }
  }, [designId, setReferencedFolders])

  /**
   * 打开文件夹标签上方的内容面板。
   */
  const openFolderPanel = useCallback((folderPath: string, event: React.MouseEvent): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    setFolderPanel({
      folderPath,
      position: { left: rect.left, bottom: window.innerHeight - rect.top + 6 },
    })
  }, [])

  /**
   * 删除项目级共享文件夹引用。
   */
  const removeFolderReference = useCallback(
    (path: string): void => {
      if (!projectId) return

      const nextFolders = referencedFolders.filter((folder) => folder.path !== path)
      setReferencedFolders(projectId, nextFolders)
      void projectApi.updateProject(projectId, { referencedFolders: nextFolders }).catch(() => {
        setReferencedFolders(projectId, referencedFolders)
      })
    },
    [projectId, referencedFolders, setReferencedFolders],
  )

  /**
   * 复制文件夹引用的 Markdown 文本。
   */
  const copyFolderReference = async (path: string): Promise<void> => {
    await navigator.clipboard.writeText(createMarkdownReference("folder", path))
    setCopiedFolderPath(path)
    window.setTimeout(
      () => setCopiedFolderPath((current) => (current === path ? null : current)),
      1500,
    )
  }

  return (
    <div
      className={`absolute min-w-0 overflow-hidden ${
        isExpanded
          ? "inset-0 flex items-start justify-start"
          : "-inset-y-1 inset-x-0 flex items-center pr-24"
      }`}
    >
      <div className="flex min-w-0 gap-1 overflow-x-auto">
        {sortedFolders.map((folder) => {
          const isCopied = copiedFolderPath === folder.path

          return (
            <LxTooltip key={folder.path} content={folder.path} placement="top">
              <span>
                <LxTag
                  bgClass="border-[#d97706] bg-[rgba(217,119,6,0.12)] text-[#d97706]"
                  hoverClass=""
                  prefix={<Folder className="h-3 w-3" />}
                  size="default"
                  suffix={
                    <button
                      aria-label="复制文件夹引用"
                      className={`flex h-4 w-4 items-center justify-center rounded-[4px] transition-colors ${
                        isCopied ? "text-current" : "text-current/60 hover:text-current"
                      }`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        void copyFolderReference(folder.path)
                      }}
                    >
                      {isCopied ? (
                        <Check className="h-2.5 w-2.5" />
                      ) : (
                        <Copy className="h-2.5 w-2.5" />
                      )}
                    </button>
                  }
                  onClick={(event) => openFolderPanel(folder.path, event)}
                  onClose={() => removeFolderReference(folder.path)}
                >
                  {getMarkdownReferenceName(folder.path)}
                </LxTag>
              </span>
            </LxTooltip>
          )
        })}
      </div>
      {folderPanel && (
        <ReferencedFolderCommandMenu
          folderPath={folderPanel.folderPath}
          position={folderPanel.position}
          onClose={() => setFolderPanel(null)}
        />
      )}
    </div>
  )
}
