import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { LxMarkdownEditor } from "@/features/markdown"
import { projectApi } from "@/features/project/api/projectApi"
import { useProjectEditor } from "@/features/project/hooks/useProjectEditor"
import { useProjectReferencedFoldersStore } from "@/features/project/referencedFoldersStore"
import { useProjectItemsVersionStore } from "@/features/project-navigation/projectItemsStore"
import { useTranslation } from "@/i18n"

// 防止 Zustand 选择器因返回新数组而重复渲染。
const EMPTY_ENABLED_FOLDER_PATHS: string[] = []

/**
 * 渲染项目条目页面。
 */
export const ProjectPage = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get("itemId")
  const {
    hasItem,
    isLoading,
    isSaved,
    loadedItemId,
    pages,
    projectId,
    save,
    setPages,
    worktreePath,
    setWorktreePath,
  } = useProjectEditor(itemId)
  const isItemLoading = isLoading || (itemId !== null && loadedItemId !== itemId)
  const [projectPath, setProjectPath] = useState<string | undefined>()
  const enabledReferencedFolderPaths = useProjectReferencedFoldersStore((state) =>
    itemId
      ? (state.enabledPathsByItemId[itemId] ?? EMPTY_ENABLED_FOLDER_PATHS)
      : EMPTY_ENABLED_FOLDER_PATHS,
  )

  // 全局 git 工作区切换：持久化到条目并同步本地状态；返回是否成功供编辑器据实提示。
  const handleWorktreePathChange = (path: string | null): Promise<boolean> => {
    if (!itemId) return Promise.resolve(false)
    if (itemId.startsWith("temp-")) {
      setWorktreePath(path)
      try {
        localStorage.setItem(`lx-agent-temp-worktree-${itemId}`, path ?? "")
      } catch {
        // 忽略存储写入异常
      }
      return Promise.resolve(true)
    }
    return projectApi
      .update(itemId, { worktreePath: path })
      .then(() => {
        setWorktreePath(path)
        useProjectItemsVersionStore.getState().bump()
        return true
      })
      .catch(() => false)
  }

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
      <LxLoadingOverlay isLoading={isItemLoading} text={t("project.loadingItem")} />
      {!isItemLoading && hasItem && (
        <LxMarkdownEditor
          key={itemId}
          itemId={itemId ?? undefined}
          initialContent={pages[0]?.content ?? ""}
          pages={pages}
          pageMode
          isSaved={isSaved}
          projectId={projectId ?? undefined}
          onPagesChange={setPages}
          onSearchFiles={projectApi.searchFiles}
          onSearchReferencedFiles={projectApi.searchReferencedFiles}
          onSearchDirectoryFiles={projectApi.searchDirectoryFiles}
          onSave={save}
          referencedProjectPaths={enabledReferencedFolderPaths}
          projectPath={projectPath}
          worktreePath={worktreePath ?? undefined}
          onWorktreePathChange={handleWorktreePathChange}
          showFolding={true}
        />
      )}
      {!isItemLoading && !itemId && (
        <div className="project-empty-card flex min-w-0 flex-1 items-center justify-center rounded-[6px] border border-white/5 bg-[#212121]">
          <span className="text-sm text-white/60">{t("project.selectItemEmpty")}</span>
        </div>
      )}
      {!isItemLoading && itemId && !hasItem && (
        <div className="project-empty-card flex min-w-0 flex-1 items-center justify-center rounded-[6px] border border-white/5 bg-[#212121]">
          <span className="text-sm text-white/60">{t("project.itemNotFound")}</span>
        </div>
      )}
    </div>
  )
}
