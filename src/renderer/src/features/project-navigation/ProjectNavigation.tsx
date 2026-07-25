import { ArrowUpDown, Import, Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LeftSideBar } from "@/components/layout/LeftSideBar"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { useLxToast } from "@/components/ui/LxToast"
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

/**
 * 页面左侧栏，展示可搜索的持久化项目与提示词层级。
 */
export const ProjectNavigation = (): React.JSX.Element => {
  const toast = useLxToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [searchKeyword, setSearchKeyword] = useState<string>("")
  const activePromptId = searchParams.get("designId") ?? ""
  const { projects, refreshProjects } = useProjectNavigationData()
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null)
  const [projectModal, setProjectModal] = useState<ProjectModalState | null>(null)
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({})
  const {
    createMenuItem,
    deleteItem,
    renameItem,
    saveProject,
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
  const addMenuItem = async (itemType: "module" | "prompt"): Promise<void> => {
    if (!menu) return
    const name = itemType === "module" ? "new module" : "new design"
    const id = await createMenuItem(menu, itemType)
    if (id) {
      if (itemType === "module") setCollapsedProjects((value) => ({ ...value, [menu.id]: false }))
      if (itemType === "prompt" && menu.type === "module") {
        setCollapsedModules((value) => ({ ...value, [menu.id]: false }))
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
      if (projectModal.mode === "create") {
        setCollapsedProjects((currentValue) => ({ ...currentValue, [projectId]: false }))
      }
      setProjectModal(null)
    }
  }

  /**
   * 更新右键目标提示词的状态。
   */
  const handlePromptStatusChange = async (status: PromptStatus): Promise<void> => {
    if (!menu) return
    await updatePromptStatus(menu.id, status)
    setMenu(null)
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
            ?.modules.flatMap((module) => module.prompts)
            .concat(projects.find((project) => project.id === menu.id)?.prompts ?? [])
            .map((prompt) => prompt.id) ?? [])
        : menu.type === "module"
          ? (projects
              .find((project) => project.id === menu.projectId)
              ?.modules.find((module) => module.id === menu.id)
              ?.prompts.map((prompt) => prompt.id) ?? [])
          : [menu.id]

    if (await deleteItem(menu)) {
      if (deletedPromptIds.includes(activePromptId)) navigate(PAGE_ROUTES.home)
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
   * 切换模块的展开状态。
   */
  const toggleModule = (moduleId: string): void => {
    setCollapsedModules((currentValue) => ({
      ...currentValue,
      [moduleId]: !currentValue[moduleId],
    }))
  }

  return (
    <LeftSideBar>
      <div className="flex h-full min-w-0 flex-col gap-3">
        <div className="flex h-7 shrink-0 items-center justify-end px-1">
          <div className="flex items-center gap-0.5">
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
            size="xs"
            onChange={(event) => setSearchKeyword(event.target.value)}
            clear
          />
        </div>

        <ProjectNavigationList
          activePromptId={activePromptId}
          collapsedModules={collapsedModules}
          collapsedProjects={collapsedProjects}
          editingItem={editingItem}
          projects={filteredProjects}
          searchKeyword={searchKeyword}
          onDesignOpen={(designId) => navigate(`${PAGE_ROUTES.design}?designId=${designId}`)}
          onEditingItemCancel={cancelEditingItem}
          onEditingItemChange={setEditingItem}
          onEditingItemCommit={commitEditingItem}
          onModuleToggle={toggleModule}
          onOpenMenu={openMenu}
          onProjectToggle={toggleProject}
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
        onAddModule={() => addMenuItem("module")}
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
    </LeftSideBar>
  )
}
