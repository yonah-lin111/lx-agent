import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { LxMarkdownEditor } from "@/features/markdown"
import { projectApi } from "@/features/project/api/projectApi"
import { useProjectEditor } from "@/features/project/hooks/useProjectEditor"
import { useProjectReferencedFoldersStore } from "@/features/project/referencedFoldersStore"

// 防止 Zustand 选择器因返回新数组而重复渲染。
const EMPTY_ENABLED_FOLDER_PATHS: string[] = []

/**
 * 渲染项目条目页面。
 */
export const ProjectPage = (): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get("itemId")
  const { hasItem, isLoading, isSaved, loadedItemId, pages, projectId, save, setPages } =
    useProjectEditor(itemId)
  const isItemLoading = isLoading || (itemId !== null && loadedItemId !== itemId)
  const [projectPath, setProjectPath] = useState<string | undefined>()
  const enabledReferencedFolderPaths = useProjectReferencedFoldersStore((state) =>
    itemId
      ? (state.enabledPathsByItemId[itemId] ?? EMPTY_ENABLED_FOLDER_PATHS)
      : EMPTY_ENABLED_FOLDER_PATHS,
  )

  // 解析当前项目文件系统路径供底部状态栏展示；virtual 项目 path 为空则状态栏整体隐藏。
  useEffect(() => {
    if (!projectId) {
      setProjectPath(undefined)
      return
    }
    let isCurrent = true
    void projectApi.listProjects().then((projects) => {
      if (!isCurrent) return
      const project = projects.find((entry) => entry.id === projectId)
      setProjectPath(project?.type === "filesystem" ? project.path : undefined)
    })
    return () => {
      isCurrent = false
    }
  }, [projectId])

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
          onSave={save}
          referencedProjectPaths={enabledReferencedFolderPaths}
          projectPath={projectPath}
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
