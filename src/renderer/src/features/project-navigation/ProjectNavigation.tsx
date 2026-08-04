import { ArrowUpDown, Import, Locate, Plus, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { useLxToast } from "@/components/ui/LxToast"
import { projectNavigationApi } from "@/features/project-navigation/api/projectNavigationApi"
import {
  ProjectModal,
  type ProjectModalMode,
  type ProjectModalValues,
} from "@/features/project-navigation/components/ProjectModal"
import {
  type EditingItem,
  ProjectNavigationList,
  type SidebarProject,
} from "@/features/project-navigation/components/ProjectNavigationList"
import {
  ProjectNavigationMenu,
  type ProjectNavigationMenuType,
  type PromptStatus,
} from "@/features/project-navigation/components/ProjectNavigationMenu"
import { useProjectNavigationActions } from "@/features/project-navigation/hooks/useProjectNavigationActions"
import { useProjectNavigationData } from "@/features/project-navigation/hooks/useProjectNavigationData"
import { filterProjectNavigationTree } from "@/features/project-navigation/utils"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

// 当前右键菜单状态。
type MenuState = {
  type: ProjectNavigationMenuType
  id: string
  projectId?: string
  title: string
  status?: PromptStatus
  x: number
  y: number
}

// 当前项目弹窗状态。
type ProjectModalState =
  | { mode: Extract<ProjectModalMode, "create"> }
  | { mode: Extract<ProjectModalMode, "edit">; project: SidebarProject }

// localStorage 中保存最近操作条目 id 的键。
const LAST_OPERATED_ITEM_KEY = "project-navigation-last-item"

// 读取最近操作的条目 id。
const readLastOperatedItemId = (): string | null => {
  try {
    return localStorage.getItem(LAST_OPERATED_ITEM_KEY)
  } catch {
    return null
  }
}

// 保存最近操作的条目 id。
const saveLastOperatedItemId = (itemId: string): void => {
  try {
    localStorage.setItem(LAST_OPERATED_ITEM_KEY, itemId)
  } catch {
    // 忽略可能存在的 Storage 写入异常。
  }
}

// 清除最近操作的条目 id。
const clearLastOperatedItemId = (): void => {
  try {
    localStorage.removeItem(LAST_OPERATED_ITEM_KEY)
  } catch {
    // 忽略可能存在的 Storage 写入异常。
  }
}

/**
 * 页面左侧栏，展示可搜索的持久化项目与条目层级。
 */
export const ProjectNavigation = (): React.JSX.Element => {
  const toast = useLxToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [searchKeyword, setSearchKeyword] = useState<string>("")
  const activePromptId = searchParams.get("itemId") ?? ""
  const { projects, refreshProjects } = useProjectNavigationData()
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null)
  const [projectModal, setProjectModal] = useState<ProjectModalState | null>(null)
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [collapsedProjectFolders, setCollapsedProjectFolders] = useState<Record<string, boolean>>(
    {},
  )
  const {
    createMenuItem,
    deleteItem,
    renameItem,
    saveProject,
    importProject,
    sortPromptsByStatus,
    updatePromptStatus,
  } = useProjectNavigationActions(projects, refreshProjects, toast)

  // 根据搜索关键词筛选项目树。
  const filteredProjects = useMemo(
    () => filterProjectNavigationTree(projects, searchKeyword),
    [projects, searchKeyword],
  )

  /**
   * 打开指定层级节点的右键菜单。
   */
  const openMenu = (
    event: React.MouseEvent,
    type: ProjectNavigationMenuType,
    item: { id: string; name: string; status?: PromptStatus },
    projectId?: string,
  ): void => {
    event.preventDefault()
    setMenu({
      type,
      id: item.id,
      projectId,
      title: item.name,
      status: item.status,
      x: event.clientX,
      y: event.clientY,
    })
  }

  /**
   * 进入右键目标的行内重命名状态。
   */
  const renameMenuItem = (): void => {
    if (!menu) return
    setEditingItem({ id: menu.id, name: menu.title })
    setMenu(null)
  }

  /**
   * 打开右键目标项目的编辑弹窗。
   */
  const openEditProjectModal = (): void => {
    if (!menu || menu.type !== "project") return
    const project = projects.find((item) => item.id === menu.id)
    if (!project) return

    setProjectModal({ mode: "edit", project })
    setMenu(null)
  }

  /**
   * 在右键菜单目标下新增节点并进入行内编辑状态。
   */
  const addMenuItem = async (itemType: "project_folder" | "prompt"): Promise<void> => {
    if (!menu) return
    const name = itemType === "project_folder" ? "new folder" : "new item"
    const id = await createMenuItem(menu, itemType)
    if (id) {
      if (itemType === "project_folder")
        setCollapsedProjects((value) => ({ ...value, [menu.id]: true }))
      if (itemType === "prompt" && menu.type === "project_folder") {
        setCollapsedProjectFolders((value) => ({ ...value, [menu.id]: true }))
      }
      if (itemType === "prompt" && menu.type === "project") {
        setCollapsedProjects((value) => ({ ...value, [menu.id]: true }))
      }
      if (itemType === "prompt") {
        navigate(`${PAGE_ROUTES.project}?itemId=${id}`)
      }
      setEditingItem({ id, name })
      setMenu(null)
    }
  }

  /**
   * 提交当前行内编辑的名称。
   */
  const commitEditingItem = async (): Promise<void> => {
    if (!editingItem) return
    const name = editingItem.name.trim()
    if (!name) {
      setEditingItem(null)
      return
    }

    if (await renameItem(editingItem.id, name)) {
      setEditingItem(null)
    }
  }

  /**
   * 取消当前行内编辑。
   */
  const cancelEditingItem = (): void => {
    setEditingItem(null)
  }

  /**
   * 根据弹窗模式创建或更新项目。
   */
  const handleProjectModalSubmit = async (values: ProjectModalValues): Promise<void> => {
    if (!projectModal) return
    const projectId = await saveProject(
      projectModal.mode === "edit" ? projectModal.project.id : null,
      values.name,
      values.path,
    )
    if (projectId) {
      if (projectModal.mode !== "edit") {
        setCollapsedProjects((currentValue) => ({ ...currentValue, [projectId]: true }))
      }
      setProjectModal(null)
    }
  }

  /**
   * 打开系统目录选择器并导入选中的项目。
   */
  const handleProjectImport = async (): Promise<void> => {
    const projectId = await importProject()
    if (projectId) {
      setCollapsedProjects((currentValue) => ({ ...currentValue, [projectId]: true }))
    }
  }

  /**
   * 更新右键目标条目的状态。
   */
  const handlePromptStatusChange = async (status: PromptStatus): Promise<void> => {
    if (!menu) return
    await updatePromptStatus(menu.id, status)
    setMenu(null)
  }

  /**
   * 更新列表中指定条目的状态。
   */
  const handlePromptStatusToggle = async (
    promptId: string,
    status: PromptStatus,
  ): Promise<void> => {
    await updatePromptStatus(promptId, status)
  }

  /**
   * 删除右键菜单目标及其下属数据。
   */
  const deleteMenuItem = async (): Promise<void> => {
    if (!menu) return
    const deletedPromptIds =
      menu.type === "project"
        ? (projects
            .find((project) => project.id === menu.id)
            ?.projectFolders.flatMap((folder) => folder.prompts)
            .concat(projects.find((project) => project.id === menu.id)?.prompts ?? [])
            .map((prompt) => prompt.id) ?? [])
        : menu.type === "project_folder"
          ? (projects
              .find((project) => project.id === menu.projectId)
              ?.projectFolders.find((folder) => folder.id === menu.id)
              ?.prompts.map((prompt) => prompt.id) ?? [])
          : [menu.id]

    if (await deleteItem(menu)) {
      if (deletedPromptIds.includes(activePromptId)) navigate(PAGE_ROUTES.project)
      setMenu(null)
    }
  }

  /**
   * 切换项目的展开状态。
   */
  const toggleProject = (projectId: string): void => {
    setCollapsedProjects((currentValue) => ({
      ...currentValue,
      [projectId]: !currentValue[projectId],
    }))
  }

  /**
   * 切换文件夹的展开状态。
   */
  const toggleProjectFolder = (projectFolderId: string): void => {
    setCollapsedProjectFolders((currentValue) => ({
      ...currentValue,
      [projectFolderId]: !currentValue[projectFolderId],
    }))
  }

  // 已自动定位过的条目 id，保证每次进入页面仅定位一次。
  const locatedPromptIdRef = useRef<string>("")

  /**
   * 定位指定条目：展开其所属项目与所属文件夹，不改变其他节点状态。
   * 返回是否定位成功。
   */
  const locatePrompt = (promptId: string): boolean => {
    if (!promptId) return false

    for (const project of projects) {
      if (project.prompts.some((prompt) => prompt.id === promptId)) {
        setCollapsedProjects((currentValue) => ({ ...currentValue, [project.id]: true }))
        return true
      }
      const folder = project.projectFolders.find((item) =>
        item.prompts.some((prompt) => prompt.id === promptId),
      )
      if (folder) {
        setCollapsedProjects((currentValue) => ({ ...currentValue, [project.id]: true }))
        setCollapsedProjectFolders((currentValue) => ({ ...currentValue, [folder.id]: true }))
        return true
      }
    }

    return false
  }

  // 每次进入项目页面（itemId 变化）时自动定位当前操作的条目一次。
  useEffect(() => {
    if (!activePromptId || locatedPromptIdRef.current === activePromptId) return
    if (locatePrompt(activePromptId)) {
      locatedPromptIdRef.current = activePromptId
    }
  }, [activePromptId, projects])

  // 打开条目时记录最近操作的条目 id，用于下次进入页面时恢复。
  useEffect(() => {
    if (activePromptId) saveLastOperatedItemId(activePromptId)
  }, [activePromptId])

  // 每次进入项目页面（无 itemId）时自动打开一次最近操作的条目。
  useEffect(() => {
    if (activePromptId) return

    let isCurrent = true
    const restoreLastOperatedItem = async (): Promise<void> => {
      const lastItemId = readLastOperatedItemId()
      if (!lastItemId) return

      try {
        const items = await projectNavigationApi.listItems()
        if (!isCurrent) return
        if (items.some((item) => item.id === lastItemId)) {
          navigate(`${PAGE_ROUTES.project}?itemId=${lastItemId}`, { replace: true })
        } else {
          clearLastOperatedItemId()
        }
      } catch {
        // 恢复失败时保留原状，等待下次进入再尝试。
      }
    }

    void restoreLastOperatedItem()
    return () => {
      isCurrent = false
    }
  }, [activePromptId, navigate])

  return (
    <>
      <div className="flex h-full min-w-0 flex-col gap-3">
        <div className="flex h-7 shrink-0 items-center justify-end px-1">
          <div className="flex items-center gap-0.5">
            <LxIconButton
              aria-label="定位当前条目"
              title={{ content: "定位当前条目", placement: "bottom" }}
              disabled={!activePromptId}
              onClick={() => locatePrompt(activePromptId)}
            >
              <Locate className="h-3.5 w-3.5" />
            </LxIconButton>
            <LxIconButton
              aria-label="按状态排序"
              title={{ content: "按状态排序", placement: "bottom" }}
              onClick={sortPromptsByStatus}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </LxIconButton>
            <LxIconButton
              aria-label="导入项目"
              title={{ content: "导入项目", placement: "bottom" }}
              onClick={() => void handleProjectImport()}
            >
              <Import className="h-4 w-4" />
            </LxIconButton>
            <LxIconButton
              aria-label="新建项目"
              title={{ content: "新建项目", placement: "bottom" }}
              onClick={() => setProjectModal({ mode: "create" })}
            >
              <Plus className="h-4 w-4" />
            </LxIconButton>
          </div>
        </div>

        <div className="px-1">
          <LxInput
            type="text"
            value={searchKeyword}
            placeholder="搜索项目..."
            aria-label="搜索项目"
            prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/25" />}
            size="sm"
            onChange={(event) => setSearchKeyword(event.target.value)}
            clear
          />
        </div>

        <ProjectNavigationList
          activePromptId={activePromptId}
          collapsedProjectFolders={collapsedProjectFolders}
          collapsedProjects={collapsedProjects}
          editingItem={editingItem}
          projects={filteredProjects}
          searchKeyword={searchKeyword}
          onEditingItemCancel={cancelEditingItem}
          onEditingItemChange={setEditingItem}
          onEditingItemCommit={commitEditingItem}
          onItemOpen={(itemId) => navigate(`${PAGE_ROUTES.project}?itemId=${itemId}`)}
          onProjectFolderToggle={toggleProjectFolder}
          onOpenMenu={openMenu}
          onProjectToggle={toggleProject}
          onPromptStatusChange={(promptId, status) =>
            void handlePromptStatusToggle(promptId, status)
          }
        />
      </div>
      <ProjectNavigationMenu
        isOpen={menu !== null}
        type={menu?.type ?? "project"}
        title={menu?.title ?? ""}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        status={menu?.status}
        onEditProject={openEditProjectModal}
        onRename={renameMenuItem}
        onAddFolder={() => addMenuItem("project_folder")}
        onAddPrompt={() => addMenuItem("prompt")}
        onStatusChange={handlePromptStatusChange}
        onDelete={deleteMenuItem}
        onClose={() => setMenu(null)}
      />
      <ProjectModal
        isOpen={projectModal !== null}
        mode={projectModal?.mode ?? "create"}
        project={projectModal?.mode === "edit" ? projectModal.project : undefined}
        onClose={() => setProjectModal(null)}
        onSubmit={handleProjectModalSubmit}
      />
    </>
  )
}
