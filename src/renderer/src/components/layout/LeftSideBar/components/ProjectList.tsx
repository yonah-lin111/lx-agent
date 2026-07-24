import { Boxes, CheckCircle2, ChevronDown, Circle, FolderKanban, LoaderCircle } from "lucide-react"
import type React from "react"
import { useState } from "react"

import type {
  LeftSideBarMenuType,
  PromptStatus,
} from "@/components/layout/LeftSideBar/components/LeftSideBarMenu"

// 侧边栏提示词数据。
export interface SidebarPrompt {
  id: string
  name: string
  status: PromptStatus
}

// 侧边栏模块数据。
export interface SidebarModule {
  id: string
  name: string
  prompts: SidebarPrompt[]
}

// 侧边栏项目数据。
export interface SidebarProject {
  id: string
  name: string
  path?: string
  modules: SidebarModule[]
  prompts: SidebarPrompt[]
}

// 行内编辑状态。
export type EditingItem = {
  id: string
  name: string
}

// 项目列表属性。
interface ProjectListProps {
  projects: SidebarProject[]
  searchKeyword: string
  activePromptId: string
  editingItem: EditingItem | null
  collapsedProjects: Record<string, boolean>
  collapsedModules: Record<string, boolean>
  onActivePromptChange: (promptId: string) => void
  onDesignOpen: () => void
  onEditingItemChange: (item: EditingItem) => void
  onEditingItemCommit: () => void
  onEditingItemCancel: () => void
  onProjectToggle: (projectId: string) => void
  onModuleToggle: (moduleId: string) => void
  onOpenMenu: (
    event: React.MouseEvent,
    type: LeftSideBarMenuType,
    item: { id: string; name: string; status?: PromptStatus },
    projectId?: string,
  ) => void
}

/**
 * 展示项目、模块和提示词树，并管理模块内已完成提示词的折叠状态。
 */
export const ProjectList = ({
  projects,
  searchKeyword,
  activePromptId,
  editingItem,
  collapsedProjects,
  collapsedModules,
  onActivePromptChange,
  onDesignOpen,
  onEditingItemChange,
  onEditingItemCommit,
  onEditingItemCancel,
  onProjectToggle,
  onModuleToggle,
  onOpenMenu,
}: ProjectListProps): React.JSX.Element => {
  const [collapsedCompletedPromptGroups, setCollapsedCompletedPromptGroups] = useState<
    Record<string, boolean>
  >({})

  /**
   * 切换指定模块内已完成提示词分组的展开状态。
   */
  const toggleCompletedPromptGroup = (moduleId: string): void => {
    setCollapsedCompletedPromptGroups((currentValue) => ({
      ...currentValue,
      [moduleId]: !(currentValue[moduleId] ?? true),
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
        className="min-w-0 flex-1 border-b border-white/20 bg-transparent px-0 text-sm text-white/80 outline-none"
        value={editingItem.name}
        onBlur={onEditingItemCommit}
        onChange={(event) => onEditingItemChange({ ...editingItem, name: event.target.value })}
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Escape") onEditingItemCancel()
          if (event.key === "Enter" && !event.nativeEvent.isComposing) onEditingItemCommit()
        }}
      />
    )
  }

  /**
   * 渲染可选择的提示词节点。
   */
  const renderPrompt = (prompt: SidebarPrompt, isNested: boolean): React.JSX.Element => (
    <div
      key={prompt.id}
      role="button"
      tabIndex={0}
      className={`flex w-full items-center gap-2 rounded-[6px] py-1.5 pr-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
        isNested ? "pl-5" : "pl-2"
      } ${
        activePromptId === prompt.id
          ? "bg-white/10 text-white"
          : "text-white/65 hover:bg-white/[0.04] hover:text-white/90"
      }`}
      onClick={() => {
        onActivePromptChange(prompt.id)
        onDesignOpen()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") event.currentTarget.click()
      }}
      onContextMenu={(event) => onOpenMenu(event, "prompt", prompt)}
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

  /**
   * 渲染模块内未完成与已完成提示词，已完成项默认折叠。
   */
  const renderModulePrompts = (prompts: SidebarPrompt[], moduleId: string): React.JSX.Element[] => {
    const unfinishedPrompts = prompts.filter((prompt) => prompt.status !== "completed")
    const completedPrompts = prompts.filter((prompt) => prompt.status === "completed")
    const shouldAutoExpand =
      searchKeyword.length > 0 || completedPrompts.some((prompt) => prompt.id === activePromptId)
    const isCompletedGroupCollapsed = shouldAutoExpand
      ? false
      : (collapsedCompletedPromptGroups[moduleId] ?? true)

    return [
      ...unfinishedPrompts.map((prompt) => renderPrompt(prompt, true)),
      ...(completedPrompts.length > 0
        ? [
            <div key={`${moduleId}:completed`} className="flex flex-col gap-0.5">
              <div className="pl-5">
                <button
                  type="button"
                  className="cursor-pointer select-none text-sm font-medium text-white/35 transition-colors hover:text-white/60"
                  aria-expanded={!isCompletedGroupCollapsed}
                  onClick={() => toggleCompletedPromptGroup(moduleId)}
                >
                  {isCompletedGroupCollapsed
                    ? `显示 ${completedPrompts.length} 个已完成项...`
                    : `收起 ${completedPrompts.length} 个已完成项`}
                </button>
              </div>
              {!isCompletedGroupCollapsed &&
                completedPrompts.map((prompt) => renderPrompt(prompt, true))}
            </div>,
          ]
        : []),
    ]
  }

  return (
    <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-2">
      {projects.length > 0 &&
        projects.map((project) => {
          const isProjectCollapsed = searchKeyword ? false : Boolean(collapsedProjects[project.id])

          return (
            <div key={project.id} className="space-y-1">
              <div
                role="button"
                tabIndex={0}
                className="group flex w-full items-center gap-1.5 rounded-[6px] px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 hover:bg-white/[0.04]"
                aria-expanded={!isProjectCollapsed}
                onClick={() => onProjectToggle(project.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") event.currentTarget.click()
                }}
                onContextMenu={(event) => onOpenMenu(event, "project", project)}
              >
                <FolderKanban className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                {renderItemName(
                  project,
                  "min-w-0 flex-1 truncate text-sm font-semibold uppercase text-white/55 transition-colors group-hover:text-white/80",
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
                          className="group flex w-full items-center gap-1.5 rounded-[6px] px-1 py-1 text-left text-sm text-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 hover:bg-white/[0.04] hover:text-white/85"
                          aria-expanded={!isModuleCollapsed}
                          onClick={() => onModuleToggle(module.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.currentTarget.click()
                            }
                          }}
                          onContextMenu={(event) => onOpenMenu(event, "module", module, project.id)}
                        >
                          <Boxes className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
                          {renderItemName(module, "min-w-0 flex-1 truncate")}
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-white/30 transition-transform ${isModuleCollapsed ? "-rotate-90" : ""}`}
                          />
                        </div>
                        {!isModuleCollapsed && renderModulePrompts(module.prompts, module.id)}
                      </div>
                    )
                  })}
                  {project.prompts.map((prompt) => renderPrompt(prompt, false))}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
