import type { ReferencedFolder } from "@shared/project"
import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { LxMarkdownEditor } from "@/components/ui/LxMarkdown"
import { projectApi } from "@/features/project/api/projectApi"
import { useProjectEditor } from "@/features/project/hooks/useProjectEditor"
import { useProjectReferencedFoldersStore } from "@/features/project/referencedFoldersStore"

// 防止 Zustand 选择器因返回新数组而重复渲染。
const EMPTY_REFERENCED_FOLDERS: ReferencedFolder[] = []

/**
 * 渲染项目条目页面。
 */
export const ProjectPage = (): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get("itemId")
  const { hasItem, isLoading, isSaved, loadedItemId, pages, projectId, save, setPages } =
    useProjectEditor(itemId)
  const isItemLoading = isLoading || (itemId !== null && loadedItemId !== itemId)
  const setReferencedFolders = useProjectReferencedFoldersStore(
    (state) => state.setReferencedFolders,
  )
  const projectReferencedFolders = useProjectReferencedFoldersStore((state) =>
    projectId
      ? (state.foldersByProjectId[projectId] ?? EMPTY_REFERENCED_FOLDERS)
      : EMPTY_REFERENCED_FOLDERS,
  )
  const enabledReferencedFolderPaths = useMemo(
    () => projectReferencedFolders.filter((folder) => folder.enabled).map((folder) => folder.path),
    [projectReferencedFolders],
  )

  const addFolderReference = useCallback(
    (path: string): void => {
      if (!projectId) return

      void projectApi.listProjects().then((projects) => {
        const project = projects.find((item) => item.id === projectId)
        if (!project || project.referencedFolders.some((folder) => folder.path === path)) return

        const referencedFolders = [
          ...project.referencedFolders,
          { path, createdAt: new Date().toISOString(), enabled: false },
        ]
        return projectApi.updateProject(projectId, { referencedFolders }).then(() => {
          setReferencedFolders(projectId, referencedFolders)
        })
      })
    },
    [projectId, setReferencedFolders],
  )

  return (
    <div className="relative flex min-w-0 flex-1">
      <LxLoadingOverlay isLoading={isItemLoading} text="Loading item..." />
      {!isItemLoading && hasItem && (
        <LxMarkdownEditor
          key={itemId}
          initialContent={pages[0]?.content ?? ""}
          pages={pages}
          pageMode
          isSaved={isSaved}
          projectId={projectId ?? undefined}
          onPagesChange={setPages}
          onSearchFiles={projectApi.searchFiles}
          onSearchReferencedFiles={projectApi.searchReferencedFiles}
          onFolderReferenceAdd={addFolderReference}
          onSave={save}
          referencedProjectPaths={enabledReferencedFolderPaths}
          showFolding={true}
        />
      )}
      {!isItemLoading && !itemId && (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-[6px] border border-white/5 bg-[#212121]">
          <span className="text-sm text-white/60">请选择一个条目</span>
        </div>
      )}
      {!isItemLoading && itemId && !hasItem && (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-[6px] border border-white/5 bg-[#212121]">
          <span className="text-sm text-white/60">未找到条目</span>
        </div>
      )}
    </div>
  )
}
