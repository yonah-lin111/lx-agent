import { ArrowUpDown, ChevronLeft, ChevronRight, Import, Plus, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  LeftSideBarMenu,
  type LeftSideBarMenuType,
  type PromptStatus,
} from "@/components/layout/LeftSideBar/components/LeftSideBarMenu"
import {
  type EditingItem,
  ProjectList,
  type SidebarProject,
} from "@/components/layout/LeftSideBar/components/ProjectList"
import {
  ProjectModal,
  type ProjectModalMode,
  type ProjectModalValues,
} from "@/components/layout/LeftSideBar/components/ProjectModal"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"

// 数据库记录转换后的侧边栏项目树。
const createSidebarProjects = (
  projectRecords: Project[],
  moduleRecords: Module[],
  designRecords: Design[],
): SidebarProject[] =>
  projectRecords.map((project) => ({
    id: project.id,
    name: project.name,
    path: project.path,
    modules: moduleRecords
      .filter((module) => module.projectId === project.id)
      .map((module) => ({
        id: module.id,
        name: module.name,
        prompts: designRecords
          .filter((design) => design.moduleId === module.id)
          .map((design) => ({ id: design.id, name: design.name, status: design.status })),
      })),
    prompts: designRecords
      .filter((design) => design.projectId === project.id && !design.moduleId)
      .map((design) => ({ id: design.id, name: design.name, status: design.status })),
  }))

// 当前右键菜单状态。
type MenuState = {
  type: LeftSideBarMenuType
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

// 提示词状态的展示排序权重。
const PROMPT_STATUS_SORT_ORDER: Record<PromptStatus, number> = {
  in_progress: 0,
  todo: 1,
  completed: 2,
}

/**
 * 页面左侧栏，展示可搜索的持久化项目与提示词层级。
 */
export const LeftSideBar = (): React.JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
  const [searchKeyword, setSearchKeyword] = useState<string>("")
  const [activePromptId, setActivePromptId] = useState<string>("")
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null)
  const [projectModal, setProjectModal] = useState<ProjectModalState | null>(null)
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({})

  /**
   * 从数据库读取并构建侧边栏项目树。
   */
  const refreshProjects = useCallback(async (): Promise<void> => {
    if (!window.api) return

    const [projectRecords, moduleRecords, designRecords] = await Promise.all([
      window.api.project.projects.list(),
      window.api.project.modules.list(),
      window.api.project.designs.list(),
    ])
    setProjects(createSidebarProjects(projectRecords, moduleRecords, designRecords))
  }, [])

  useEffect(() => {
    void refreshProjects().catch((error: unknown) => console.error("Failed to load designs", error))
  }, [refreshProjects])

  // 根据搜索关键词筛选项目树。
  const filteredProjects = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    if (!keyword) return projects

    return projects.flatMap((project) => {
      const matchesProject = project.name.toLowerCase().includes(keyword)
      const modules = project.modules
        .map((module) => ({
          ...module,
          prompts: module.prompts.filter((prompt) => prompt.name.toLowerCase().includes(keyword)),
        }))
        .filter(
          (module) =>
            matchesProject ||
            module.name.toLowerCase().includes(keyword) ||
            module.prompts.length > 0,
        )
      const prompts = project.prompts.filter((prompt) =>
        prompt.name.toLowerCase().includes(keyword),
      )

      return matchesProject || modules.length > 0 || prompts.length > 0
        ? [{ ...project, modules, prompts }]
        : []
    })
  }, [projects, searchKeyword])

  /**
   * 打开指定层级节点的右键菜单。
   */
  const openMenu = (
    event: React.MouseEvent,
    type: LeftSideBarMenuType,
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
    if (!window.api) return

    const item =
      itemType === "module"
        ? await window.api.project.modules.create({ projectId: menu.id, name })
        : await window.api.project.designs.create({
            projectId: menu.type === "project" ? menu.id : (menu.projectId ?? ""),
            moduleId: menu.type === "module" ? menu.id : undefined,
            name,
          })

    await refreshProjects()
    if (itemType === "module") setCollapsedProjects((value) => ({ ...value, [menu.id]: false }))
    if (itemType === "prompt" && menu.type === "module") {
      setCollapsedModules((value) => ({ ...value, [menu.id]: false }))
    }
    setEditingItem({ id: item.id, name })
    setMenu(null)
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

    if (!window.api) return

    const project = projects.find((item) => item.id === editingItem.id)
    const module = projects
      .flatMap((item) => item.modules)
      .find((item) => item.id === editingItem.id)

    if (project) {
      await window.api.project.projects.update(project.id, { name })
    } else if (module) {
      await window.api.project.modules.update(module.id, { name })
    } else {
      await window.api.project.designs.update(editingItem.id, { name })
    }

    await refreshProjects()
    setEditingItem(null)
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
    if (!window.api) return

    const type = values.path ? "filesystem" : "virtual"

    if (projectModal.mode === "create") {
      const project = await window.api.project.projects.create({ ...values, type })
      setCollapsedProjects((currentValue) => ({ ...currentValue, [project.id]: false }))
    } else {
      await window.api.project.projects.update(projectModal.project.id, {
        name: values.name,
        path: values.path ?? "",
        type,
      })
    }

    await refreshProjects()
    setProjectModal(null)
  }

  /**
   * 更新右键目标提示词的状态。
   */
  const updatePromptStatus = async (status: PromptStatus): Promise<void> => {
    if (!menu) return
    if (!window.api) return

    await window.api.project.designs.update(menu.id, { status })
    await refreshProjects()
    setMenu(null)
  }

  /**
   * 按提示词状态稳定排序各模块和项目直属提示词。
   */
  const sortPromptsByStatus = async (): Promise<void> => {
    if (!window.api) return

    const sortedIds = projects
      .flatMap((project) => [
        ...project.modules.flatMap((module) => module.prompts),
        ...project.prompts,
      ])
      .map((prompt, index) => ({ prompt, index }))
      .sort(
        (left, right) =>
          PROMPT_STATUS_SORT_ORDER[left.prompt.status] -
            PROMPT_STATUS_SORT_ORDER[right.prompt.status] || left.index - right.index,
      )
      .map(({ prompt }) => prompt.id)

    await window.api.project.designs.sort(sortedIds)
    await refreshProjects()
  }

  /**
   * 删除右键菜单目标及其下属数据。
   */
  const deleteMenuItem = async (): Promise<void> => {
    if (!menu) return
    if (!window.api) return

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

    if (menu.type === "project") await window.api.project.projects.delete(menu.id)
    if (menu.type === "module") await window.api.project.modules.delete(menu.id)
    if (menu.type === "prompt") await window.api.project.designs.delete(menu.id)

    if (deletedPromptIds.includes(activePromptId)) setActivePromptId("")
    await refreshProjects()
    setMenu(null)
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
    <aside
      className={`h-40 shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-2 transition-[width,max-width,min-width] duration-300 ease-in-out lg:h-full ${
        isCollapsed
          ? "w-16 min-w-16 max-w-16"
          : "w-full min-w-full max-w-full lg:w-56 lg:min-w-56 lg:max-w-56"
      }`}
    >
      {isCollapsed ? (
        <div className="flex h-full justify-center pt-1">
          <LxIconButton
            aria-label="展开左侧栏"
            title={{ content: "展开左侧栏", placement: "right" }}
            onClick={() => setIsCollapsed(false)}
          >
            <ChevronRight className="h-4 w-4" />
          </LxIconButton>
        </div>
      ) : (
        <div className="flex h-full min-w-0 flex-col gap-3">
          <div className="flex h-7 shrink-0 items-center justify-between px-1">
            <LxIconButton
              aria-label="折叠左侧栏"
              title={{ content: "折叠左侧栏", placement: "right" }}
              onClick={() => setIsCollapsed(true)}
            >
              <ChevronLeft className="h-4 w-4" />
            </LxIconButton>
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

          <ProjectList
            activePromptId={activePromptId}
            collapsedModules={collapsedModules}
            collapsedProjects={collapsedProjects}
            editingItem={editingItem}
            projects={filteredProjects}
            searchKeyword={searchKeyword}
            onActivePromptChange={setActivePromptId}
            onEditingItemCancel={cancelEditingItem}
            onEditingItemChange={setEditingItem}
            onEditingItemCommit={commitEditingItem}
            onModuleToggle={toggleModule}
            onOpenMenu={openMenu}
            onProjectToggle={toggleProject}
          />
        </div>
      )}
      <LeftSideBarMenu
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
        onStatusChange={updatePromptStatus}
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
    </aside>
  )
}
