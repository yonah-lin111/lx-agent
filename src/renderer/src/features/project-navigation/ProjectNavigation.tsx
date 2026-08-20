import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Import,
  Locate,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxMenuItem } from "@/components/ui/LxMenu"
import { LxTag, type LxTagColor } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useRecentItemsStore } from "@/features/project/recentItemsStore"
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
import type {
  ProjectNavigationFilterScope,
  ProjectNavigationSortDirection,
  ProjectNavigationSortKey,
} from "@/features/project-navigation/types"
import {
  filterProjectNavigationTree,
  filterProjectNavigationTreeByStatus,
  sortProjectNavigationTree,
} from "@/features/project-navigation/utils"
import { useTranslation } from "@/i18n"
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

// 当前排序偏好。
type ProjectNavigationSort = {
  key: ProjectNavigationSortKey
  direction: ProjectNavigationSortDirection
}

// 默认排序偏好：创建时间升序。
const DEFAULT_SORT: ProjectNavigationSort = { key: "createdAt", direction: "asc" }

// localStorage 中保存排序偏好的键。
const SORT_STORAGE_KEY = "project-navigation-sort"

// 读取排序偏好，缺失或损坏时回退到默认值。
const readSortPreference = (): ProjectNavigationSort => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SORT_STORAGE_KEY) ?? "",
    ) as Partial<ProjectNavigationSort>
    const isSortKey = (key: string | undefined): key is ProjectNavigationSortKey =>
      key === "name" || key === "createdAt" || key === "updatedAt"
    const isDirection = (
      direction: string | undefined,
    ): direction is ProjectNavigationSortDirection => direction === "asc" || direction === "desc"
    if (isSortKey(parsed.key) && isDirection(parsed.direction)) {
      return { key: parsed.key, direction: parsed.direction }
    }
  } catch {
    // JSON 解析失败时回退到默认值。
  }
  return DEFAULT_SORT
}

// 保存排序偏好。
const saveSortPreference = (sort: ProjectNavigationSort): void => {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort))
  } catch {
    // 忽略可能存在的 Storage 写入异常。
  }
}

/**
 * 页面左侧栏，展示可搜索的持久化项目与条目层级。
 */
export const ProjectNavigation = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [searchKeyword, setSearchKeyword] = useState<string>("")
  const activePromptId = searchParams.get("itemId") ?? ""
  const pushRecentItem = useRecentItemsStore((state) => state.push)
  const { projects, refreshProjects } = useProjectNavigationData()
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null)
  const [projectModal, setProjectModal] = useState<ProjectModalState | null>(null)
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [collapsedProjectFolders, setCollapsedProjectFolders] = useState<Record<string, boolean>>(
    {},
  )
  const [statusFilter, setStatusFilter] = useState<PromptStatus[]>([])
  const [filterScope, setFilterScope] = useState<ProjectNavigationFilterScope>("all")
  const [sort, setSort] = useState<ProjectNavigationSort>(readSortPreference)
  // 筛选激活前的折叠状态快照，取消筛选时用于恢复。
  const collapseSnapshotRef = useRef<{
    collapsedProjects: Record<string, boolean>
    collapsedProjectFolders: Record<string, boolean>
  } | null>(null)
  const { createMenuItem, deleteItem, renameItem, saveProject, importProject, updatePromptStatus } =
    useProjectNavigationActions(projects, refreshProjects, toast)

  // 当前激活条目所属的项目 id，用于"当前项目"范围筛选。
  const activeProjectId = useMemo(() => {
    if (!activePromptId) return undefined
    return projects.find(
      (project) =>
        project.prompts.some((prompt) => prompt.id === activePromptId) ||
        project.projectFolders.some((folder) =>
          folder.prompts.some((prompt) => prompt.id === activePromptId),
        ),
    )?.id
  }, [activePromptId, projects])

  // 先按关键词过滤，再按状态与范围过滤项目树，最后按当前排序偏好重排。
  const filteredProjects = useMemo(
    () =>
      sortProjectNavigationTree(
        filterProjectNavigationTreeByStatus(
          filterProjectNavigationTree(projects, searchKeyword),
          statusFilter,
          filterScope,
          activeProjectId,
        ),
        sort.key,
        sort.direction,
      ),
    [projects, searchKeyword, statusFilter, filterScope, activeProjectId, sort],
  )

  // 排序偏好变更时持久化到 localStorage。
  useEffect(() => {
    saveSortPreference(sort)
  }, [sort])

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
        pushRecentItem(id)
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

  /**
   * 当前可见项目与文件夹是否已全部折叠，用于切换折叠/展开全部图标。
   */
  const isAllCollapsed =
    searchKeyword.length === 0 &&
    filteredProjects.every(
      (project) =>
        !collapsedProjects[project.id] &&
        project.projectFolders.every((folder) => !collapsedProjectFolders[folder.id]),
    )

  /**
   * 折叠或展开全部项目与文件夹，并同步图标状态。
   */
  const toggleCollapseAll = (): void => {
    const nextCollapsedProjects = { ...collapsedProjects }
    const nextCollapsedFolders = { ...collapsedProjectFolders }
    for (const project of filteredProjects) {
      nextCollapsedProjects[project.id] = isAllCollapsed
      for (const folder of project.projectFolders) {
        nextCollapsedFolders[folder.id] = isAllCollapsed
      }
    }
    setCollapsedProjects(nextCollapsedProjects)
    setCollapsedProjectFolders(nextCollapsedFolders)
  }

  // 范围筛选选项（单选）。
  const scopeFilterOptions: { value: ProjectNavigationFilterScope; label: string }[] = [
    { value: "all", label: t("project.allProjects") },
    { value: "current", label: t("project.currentProject") },
  ]

  // 状态筛选选项（多选），颜色与条目状态图标一致。
  const statusFilterOptions: { value: PromptStatus; label: string; color: LxTagColor }[] = [
    { value: "todo", label: t("agent.promptStatusTodo"), color: "gray" },
    { value: "in_progress", label: t("agent.promptStatusInProgress"), color: "amber" },
    { value: "completed", label: t("agent.promptStatusCompleted"), color: "emerald" },
  ]

  /**
   * 展开范围内包含指定状态条目的项目与文件夹；首次激活筛选时保存折叠状态快照，
   * 取消筛选时恢复快照，其余容器保持原折叠状态。
   */
  const expandStatusFilteredContainers = (
    statuses: PromptStatus[],
    scope: ProjectNavigationFilterScope,
  ): void => {
    if (statuses.length === 0) {
      if (collapseSnapshotRef.current) {
        setCollapsedProjects(collapseSnapshotRef.current.collapsedProjects)
        setCollapsedProjectFolders(collapseSnapshotRef.current.collapsedProjectFolders)
        collapseSnapshotRef.current = null
      }
      // 恢复原折叠状态后，展开当前激活条目所属的项目与文件夹。
      locatePrompt(activePromptId)
      return
    }
    if (statusFilter.length === 0 && !collapseSnapshotRef.current) {
      collapseSnapshotRef.current = { collapsedProjects, collapsedProjectFolders }
    }
    const nextCollapsedProjects = { ...collapsedProjects }
    const nextCollapsedFolders = { ...collapsedProjectFolders }
    for (const project of projects) {
      if (scope !== "all" && activeProjectId && project.id !== activeProjectId) continue
      const matchingFolders = project.projectFolders.filter((folder) =>
        folder.prompts.some((prompt) => statuses.includes(prompt.status)),
      )
      if (
        project.prompts.some((prompt) => statuses.includes(prompt.status)) ||
        matchingFolders.length > 0
      ) {
        nextCollapsedProjects[project.id] = true
      }
      for (const folder of matchingFolders) {
        nextCollapsedFolders[folder.id] = true
      }
    }
    setCollapsedProjects(nextCollapsedProjects)
    setCollapsedProjectFolders(nextCollapsedFolders)
  }

  /**
   * 切换筛选范围，重复点击当前范围时回退为"全部项目"。
   */
  const toggleScopeFilter = (scope: ProjectNavigationFilterScope): void => {
    const next = filterScope === scope ? "all" : scope
    setFilterScope(next)
    expandStatusFilteredContainers(statusFilter, next)
  }

  /**
   * 切换筛选状态的多选状态。
   */
  const toggleStatusFilter = (status: PromptStatus): void => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((item) => item !== status)
      : [...statusFilter, status]
    setStatusFilter(next)
    expandStatusFilteredContainers(next, filterScope)
  }

  const addPanel = (
    <div className="flex min-w-36 flex-col gap-0.5" aria-label={t("project.createOrImportProject")}>
      <LxMenuItem
        leading={<Plus className="h-3.5 w-3.5 text-white/45" />}
        onClick={() => setProjectModal({ mode: "create" })}
      >
        {t("project.newProject")}
      </LxMenuItem>
      <LxMenuItem
        leading={<Import className="h-3.5 w-3.5 text-white/45" />}
        onClick={() => void handleProjectImport()}
      >
        {t("project.importProject")}
      </LxMenuItem>
    </div>
  )

  const filterPanel = (
    <div className="flex w-56 flex-col gap-1.5" aria-label={t("project.filterItems")}>
      <div className="flex flex-col gap-1 text-xs font-semibold text-white/55">
        {t("project.scope")}
        <div className="flex flex-nowrap gap-1">
          {scopeFilterOptions.map(({ value, label }) => (
            <LxTag
              key={value}
              size="small"
              highlighted={filterScope === value}
              onClick={() => toggleScopeFilter(value)}
            >
              {label}
            </LxTag>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1 text-xs font-semibold text-white/55">
        {t("common.status")}
        <div className="flex flex-nowrap gap-1">
          {statusFilterOptions.map(({ value, label, color }) => {
            const isSelected = statusFilter.includes(value)
            return (
              <LxTag
                size="small"
                key={value}
                color={color}
                highlighted={isSelected}
                onClick={() => toggleStatusFilter(value)}
              >
                {label}
              </LxTag>
            )
          })}
        </div>
      </div>
    </div>
  )

  // 排序选项（单选），同一键重复点击切换升/降序。
  const sortOptions: { key: ProjectNavigationSortKey; label: string }[] = [
    { key: "name", label: t("project.sortAlphabetical") },
    { key: "createdAt", label: t("project.sortCreatedAt") },
    { key: "updatedAt", label: t("project.sortUpdatedAt") },
  ]

  /**
   * 切换排序键或方向：点击新键切到升序，重复点击当前键切换升降序。
   */
  const toggleSort = (key: ProjectNavigationSortKey): void => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    )
  }

  const sortPanel = (
    <div className="flex w-44 flex-col gap-1.5" aria-label={t("project.sortItems")}>
      {sortOptions.map(({ key, label }) => {
        const isSelected = sort.key === key
        return (
          <LxTag
            key={key}
            highlighted={isSelected}
            suffix={
              isSelected ? (
                sort.direction === "asc" ? (
                  <ArrowUp className="h-2.5 w-2.5" />
                ) : (
                  <ArrowDown className="h-2.5 w-2.5" />
                )
              ) : undefined
            }
            onClick={() => toggleSort(key)}
          >
            {label}
          </LxTag>
        )
      })}
    </div>
  )

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
              aria-label={t("project.locateCurrentItem")}
              title={{ content: t("project.locateCurrentItem"), placement: "bottom" }}
              disabled={!activePromptId}
              onClick={() => locatePrompt(activePromptId)}
              size="small"
            >
              <Locate className="h-3.5 w-3.5" />
            </LxIconButton>
            <LxIconButton
              aria-label={isAllCollapsed ? t("project.expandAll") : t("project.collapseAll")}
              title={{
                content: isAllCollapsed ? t("project.expandAll") : t("project.collapseAll"),
                placement: "bottom",
              }}
              disabled={searchKeyword.length > 0}
              onClick={toggleCollapseAll}
              size="small"
            >
              {isAllCollapsed ? (
                <ChevronsDownUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronsUpDown className="h-3.5 w-3.5" />
              )}
            </LxIconButton>
            <LxTooltip
              content={filterPanel}
              contentClassName="!p-2"
              placement="bottom"
              trigger="hover"
            >
              <LxIconButton aria-label={t("project.filterItems")} size="small">
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </LxIconButton>
            </LxTooltip>
            <LxTooltip
              content={sortPanel}
              contentClassName="!p-2"
              placement="bottom"
              trigger="hover"
            >
              <LxIconButton aria-label={t("project.sortItems")} size="small">
                <ArrowUpDown className="h-3.5 w-3.5" />
              </LxIconButton>
            </LxTooltip>
            <LxTooltip
              content={addPanel}
              contentClassName="!p-1"
              placement="bottom"
              trigger="hover"
              closeOnContentClick
            >
              <LxIconButton aria-label={t("project.createOrImportProject")} size="small">
                <Plus className="h-3.5 w-3.5" />
              </LxIconButton>
            </LxTooltip>
          </div>
        </div>

        <div className="px-1">
          <LxInput
            type="text"
            value={searchKeyword}
            placeholder={t("project.searchProjects")}
            aria-label={t("project.searchProjects")}
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
          onItemOpen={(itemId) => {
            pushRecentItem(itemId)
            navigate(`${PAGE_ROUTES.project}?itemId=${itemId}`)
          }}
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
