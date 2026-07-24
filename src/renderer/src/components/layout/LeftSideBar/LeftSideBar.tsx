import {
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  FolderKanban,
  Import,
  LoaderCircle,
  Plus,
  Search,
} from "lucide-react"
import { useMemo, useState } from "react"
import {
  LeftSideBarMenu,
  type LeftSideBarMenuType,
  type PromptStatus,
} from "@/components/layout/LeftSideBar/components/LeftSideBarMenu"
import {
  ProjectModal,
  type ProjectModalMode,
  type ProjectModalValues,
} from "@/components/layout/LeftSideBar/components/ProjectModal"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"

// 模拟提示词数据结构。
interface MockPrompt {
  id: string
  name: string
  status: PromptStatus
}

// 模拟模块数据结构。
interface MockModule {
  id: string
  name: string
  prompts: MockPrompt[]
}

// 模拟项目数据结构。
interface MockProject {
  id: string
  name: string
  path?: string
  modules: MockModule[]
  prompts: MockPrompt[]
}

// 侧边栏展示用的模拟项目数据。
const MOCK_PROJECTS: MockProject[] = [
  {
    id: "lx-agent",
    name: "LX Agent",
    modules: [
      {
        id: "product",
        name: "产品规划",
        prompts: [
          { id: "product-1", name: "需求澄清与拆解", status: "in_progress" },
          { id: "product-2", name: "功能验收清单", status: "todo" },
        ],
      },
      {
        id: "development",
        name: "研发协作",
        prompts: [{ id: "development-1", name: "代码审查规范", status: "completed" }],
      },
    ],
    prompts: [{ id: "lx-1", name: "项目上下文初始化", status: "todo" }],
  },
  {
    id: "website",
    name: "官网改版",
    modules: [
      {
        id: "design",
        name: "界面设计",
        prompts: [{ id: "design-1", name: "首页视觉方向", status: "completed" }],
      },
    ],
    prompts: [],
  },
]

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

// 当前行内编辑状态。
type EditingItem = {
  id: string
  name: string
}

// 当前项目弹窗状态。
type ProjectModalState =
  | { mode: Extract<ProjectModalMode, "create"> }
  | { mode: Extract<ProjectModalMode, "edit">; project: MockProject }

/**
 * 页面左侧栏，展示可搜索的模拟项目与提示词层级。
 */
export const LeftSideBar = (): React.JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
  const [searchKeyword, setSearchKeyword] = useState<string>("")
  const [activePromptId, setActivePromptId] = useState<string>("product-1")
  const [projects, setProjects] = useState<MockProject[]>(MOCK_PROJECTS)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null)
  const [projectModal, setProjectModal] = useState<ProjectModalState | null>(null)
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({
    development: true,
    design: true,
  })

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
  const addMenuItem = (itemType: "module" | "prompt"): void => {
    if (!menu) return
    const id = crypto.randomUUID()
    const name = itemType === "module" ? "new module" : "new design"

    setProjects((currentProjects) =>
      currentProjects.map((project) => {
        if (itemType === "module" && project.id === menu.id) {
          return { ...project, modules: [...project.modules, { id, name, prompts: [] }] }
        }
        if (itemType === "prompt" && menu.type === "project" && project.id === menu.id) {
          return { ...project, prompts: [...project.prompts, { id, name, status: "todo" }] }
        }
        if (itemType === "prompt" && menu.type === "module" && project.id === menu.projectId) {
          return {
            ...project,
            modules: project.modules.map((module) =>
              module.id === menu.id
                ? { ...module, prompts: [...module.prompts, { id, name, status: "todo" }] }
                : module,
            ),
          }
        }
        return project
      }),
    )
    if (itemType === "module") setCollapsedProjects((value) => ({ ...value, [menu.id]: false }))
    if (itemType === "prompt" && menu.type === "module") {
      setCollapsedModules((value) => ({ ...value, [menu.id]: false }))
    }
    setEditingItem({ id, name })
    setMenu(null)
  }

  /**
   * 提交当前行内编辑的名称。
   */
  const commitEditingItem = (): void => {
    if (!editingItem) return
    const name = editingItem.name.trim()
    if (!name) {
      setEditingItem(null)
      return
    }

    setProjects((currentProjects) =>
      currentProjects.map((project) => ({
        ...project,
        name: project.id === editingItem.id ? name : project.name,
        modules: project.modules.map((module) => ({
          ...module,
          name: module.id === editingItem.id ? name : module.name,
          prompts: module.prompts.map((prompt) =>
            prompt.id === editingItem.id ? { ...prompt, name } : prompt,
          ),
        })),
        prompts: project.prompts.map((prompt) =>
          prompt.id === editingItem.id ? { ...prompt, name } : prompt,
        ),
      })),
    )
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
  const handleProjectModalSubmit = (values: ProjectModalValues): void => {
    if (!projectModal) return

    if (projectModal.mode === "create") {
      const id = crypto.randomUUID()
      setProjects((currentProjects) => [
        ...currentProjects,
        { id, ...values, modules: [], prompts: [] },
      ])
      setCollapsedProjects((currentValue) => ({ ...currentValue, [id]: false }))
    } else {
      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.id === projectModal.project.id ? { ...project, ...values } : project,
        ),
      )
    }

    setProjectModal(null)
  }

  /**
   * 更新右键目标提示词的状态。
   */
  const updatePromptStatus = (status: PromptStatus): void => {
    if (!menu) return
    setProjects((currentProjects) =>
      currentProjects.map((project) => ({
        ...project,
        modules: project.modules.map((module) => ({
          ...module,
          prompts: module.prompts.map((prompt) =>
            prompt.id === menu.id ? { ...prompt, status } : prompt,
          ),
        })),
        prompts: project.prompts.map((prompt) =>
          prompt.id === menu.id ? { ...prompt, status } : prompt,
        ),
      })),
    )
    setMenu(null)
  }

  /**
   * 删除右键菜单目标及其下属数据。
   */
  const deleteMenuItem = (): void => {
    if (!menu) return
    setProjects((currentProjects) =>
      currentProjects
        .filter((project) => menu.type !== "project" || project.id !== menu.id)
        .map((project) => ({
          ...project,
          modules:
            menu.type === "module" && project.id === menu.projectId
              ? project.modules.filter((module) => module.id !== menu.id)
              : project.modules.map((module) => ({
                  ...module,
                  prompts:
                    menu.type === "prompt"
                      ? module.prompts.filter((prompt) => prompt.id !== menu.id)
                      : module.prompts,
                })),
          prompts:
            menu.type === "prompt"
              ? project.prompts.filter((prompt) => prompt.id !== menu.id)
              : project.prompts,
        })),
    )
    if (menu.type === "prompt" && activePromptId === menu.id) setActivePromptId("")
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

  /**
   * 渲染提示词状态图标。
   */
  const renderStatusIcon = (status: PromptStatus): React.JSX.Element => {
    if (status === "completed") {
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
    }
    if (status === "in_progress") {
      return <LoaderCircle className="h-3.5 w-3.5 animate-spin text-amber-400/80" />
    }
    return <Circle className="h-3.5 w-3.5 text-white/30" />
  }

  /**
   * 渲染名称或对应的行内编辑输入框。
   */
  const renderItemName = (
    item: { id: string; name: string },
    className: string,
  ): React.JSX.Element => {
    if (editingItem?.id !== item.id) return <span className={className}>{item.name}</span>

    return (
      <input
        autoFocus
        className="min-w-0 flex-1 border-b border-white/20 bg-transparent px-0 text-xs text-white/80 outline-none"
        value={editingItem.name}
        onBlur={commitEditingItem}
        onChange={(event) => setEditingItem({ ...editingItem, name: event.target.value })}
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Escape") cancelEditingItem()
          if (event.key === "Enter" && !event.nativeEvent.isComposing) commitEditingItem()
        }}
      />
    )
  }

  /**
   * 渲染可选择的提示词节点。
   */
  const renderPrompt = (prompt: MockPrompt, isNested: boolean): React.JSX.Element => (
    <div
      key={prompt.id}
      role="button"
      tabIndex={0}
      className={`flex w-full items-center gap-2 rounded-[6px] py-1.5 pr-2 text-left text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
        isNested ? "pl-5" : "pl-2"
      } ${
        activePromptId === prompt.id
          ? "bg-white/10 text-white"
          : "text-white/65 hover:bg-white/[0.04] hover:text-white/90"
      }`}
      onClick={() => setActivePromptId(prompt.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") event.currentTarget.click()
      }}
      onContextMenu={(event) => openMenu(event, "prompt", prompt)}
    >
      {renderStatusIcon(prompt.status)}
      {renderItemName(
        prompt,
        prompt.status === "completed"
          ? "min-w-0 flex-1 truncate text-white/40 line-through"
          : "min-w-0 flex-1 truncate",
      )}
    </div>
  )

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

          <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-2">
            {filteredProjects.length > 0 ? (
              filteredProjects.map((project) => {
                const isProjectCollapsed = searchKeyword
                  ? false
                  : Boolean(collapsedProjects[project.id])

                return (
                  <div key={project.id} className="space-y-1">
                    <div
                      role="button"
                      tabIndex={0}
                      className="group flex w-full items-center gap-1.5 rounded-[6px] px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 hover:bg-white/[0.04]"
                      aria-expanded={!isProjectCollapsed}
                      onClick={() => toggleProject(project.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") event.currentTarget.click()
                      }}
                      onContextMenu={(event) => openMenu(event, "project", project)}
                    >
                      <FolderKanban className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                      {renderItemName(
                        project,
                        "min-w-0 flex-1 truncate text-xs font-semibold uppercase text-white/55 transition-colors group-hover:text-white/80",
                      )}
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-white/30 transition-transform ${isProjectCollapsed ? "-rotate-90" : ""}`}
                      />
                    </div>

                    {!isProjectCollapsed && (
                      <div className="space-y-0.5">
                        {project.modules.map((module) => {
                          const isModuleCollapsed = searchKeyword
                            ? false
                            : Boolean(collapsedModules[module.id])

                          return (
                            <div key={module.id} className="space-y-0.5">
                              <div
                                role="button"
                                tabIndex={0}
                                className="group flex w-full items-center gap-1.5 rounded-[6px] px-1 py-1 text-left text-xs text-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 hover:bg-white/[0.04] hover:text-white/85"
                                aria-expanded={!isModuleCollapsed}
                                onClick={() => toggleModule(module.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ")
                                    event.currentTarget.click()
                                }}
                                onContextMenu={(event) =>
                                  openMenu(event, "module", module, project.id)
                                }
                              >
                                <Boxes className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
                                {renderItemName(module, "min-w-0 flex-1 truncate")}
                                <ChevronDown
                                  className={`h-3.5 w-3.5 text-white/30 transition-transform ${isModuleCollapsed ? "-rotate-90" : ""}`}
                                />
                              </div>
                              {!isModuleCollapsed &&
                                module.prompts.map((prompt) => renderPrompt(prompt, true))}
                            </div>
                          )
                        })}
                        {project.prompts.map((prompt) => renderPrompt(prompt, false))}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="rounded-[6px] border border-white/5 px-3 py-4 text-center text-xs text-white/35">
                没有匹配的项目
              </div>
            )}
          </div>
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
