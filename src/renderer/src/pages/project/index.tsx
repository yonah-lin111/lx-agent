import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { LxMarkdownEditor } from "@/components/ui/LxMarkdown"
import { projectApi } from "@/features/project/api/projectApi"
import { useProjectEditor } from "@/features/project/hooks/useProjectEditor"
import { useProjectReferencedFoldersStore } from "@/features/project/referencedFoldersStore"

/**
 * 渲染设计页面。
 */
export const ProjectPage = (): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const designId = searchParams.get("designId")
  const { content, hasDesign, isLoading, isSaved, loadedDesignId, projectId, save, setContent } =
    useProjectEditor(designId)
  const isDesignLoading = isLoading || (designId !== null && loadedDesignId !== designId)
  const setReferencedFolders = useProjectReferencedFoldersStore(
    (state) => state.setReferencedFolders,
  )

  const addFolderReference = useCallback(
    (path: string): void => {
      if (!projectId) return

      void projectApi.listProjects().then((projects) => {
        const project = projects.find((item) => item.id === projectId)
        if (!project || project.referencedFolders.some((folder) => folder.path === path)) return

        const referencedFolders = [
          ...project.referencedFolders,
          { path, createdAt: new Date().toISOString() },
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
      <LxLoadingOverlay isLoading={isDesignLoading} text="Loading design..." />
      {!isDesignLoading && hasDesign && (
        <LxMarkdownEditor
          key={designId}
          initialContent={content}
          isSaved={isSaved}
          projectId={projectId ?? undefined}
          onChange={setContent}
          onSearchFiles={projectApi.searchFiles}
          onSearchReferencedFiles={projectApi.searchReferencedFiles}
          onFolderReferenceAdd={addFolderReference}
          onSave={save}
          showFolding={true}
        />
      )}
      {!isDesignLoading && !designId && (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-[6px] border border-white/5 bg-[#212121]">
          <span className="text-sm text-white/60">请选择一个设计</span>
        </div>
      )}
      {!isDesignLoading && designId && !hasDesign && (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-[6px] border border-white/5 bg-[#212121]">
          <span className="text-sm text-white/60">未找到设计</span>
        </div>
      )}
    </div>
  )
}
