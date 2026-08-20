import { Boxes, CheckCircle2, ChevronDown, Circle, File, Folder } from "lucide-react"
import type React from "react"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { TreeBranchIcon } from "@/components/ui/TreeBranchIcon"
import type {
  EditingItem,
  ProjectNavigationMenuType,
  ProjectNavigationProject,
  ProjectNavigationPrompt,
  PromptStatus,
} from "@/features/project-navigation/types"

export type {
  EditingItem,
  ProjectNavigationProject as SidebarProject,
  ProjectNavigationPrompt as SidebarPrompt,
} from "@/features/project-navigation/types"

// 状态循环切换顺序：未完成 -> 进行中 -> 完成。
const NEXT_PROMPT_STATUS: Record<PromptStatus, PromptStatus> = {
  todo: "in_progress",
  in_progress: "completed",
  completed: "todo",
}

// 状态对应的中文名称。
const PROMPT_STATUS_LABELS: Record<PromptStatus, string> = {
  todo: "待处理",
  in_progress: "进行中",
  completed: "已完成",
}

// 项目列表属性。
interface ProjectNavigationListProps {
  projects: ProjectNavigationProject[]
  searchKeyword: string
  activePromptId: string
  editingItem: EditingItem | null
  collapsedProjects: Record<string, boolean>
  collapsedProjectFolders: Record<string, boolean>
  onItemOpen: (itemId: string) => void
  onPromptStatusChange: (promptId: string, status: PromptStatus) => void
  onEditingItemChange: (item: EditingItem) => void
  onEditingItemCommit: () => void
  onEditingItemCancel: () => void
  onProjectToggle: (projectId: string) => void
  onProjectFolderToggle: (projectFolderId: string) => void
  onOpenMenu: (
    event: React.MouseEvent,
    type: ProjectNavigationMenuType,
    item: { id: string; name: string; status?: PromptStatus },
    projectId?: string,
  ) => void
}

/**
 * 展示项目、文件夹和条目树，条目顺序由父组件按状态分组与排序键预先排好。
 */
export const ProjectNavigationList = ({
  projects,
  searchKeyword,
  activePromptId,
  editingItem,
  collapsedProjects,
  collapsedProjectFolders,
  onItemOpen,
  onPromptStatusChange,
  onEditingItemChange,
  onEditingItemCommit,
  onEditingItemCancel,
  onProjectToggle,
  onProjectFolderToggle,
  onOpenMenu,
}: ProjectNavigationListProps): React.JSX.Element => {
  /**
   * 渲染条目状态图标，点击可循环切换状态。
   */
  const renderStatusIcon = (prompt: ProjectNavigationPrompt): React.JSX.Element => {
    const className = prompt.status === "completed" ? "text-emerald-400/80" : "text-white/30"

    return (
      <LxIconButton
        size="small"
        shape="circle"
        showHoverBg={false}
        aria-label="切换状态"
        title={{ content: PROMPT_STATUS_LABELS[prompt.status] }}
        className="-m-0.5 shrink-0"
        onClick={(event) => {
          event.stopPropagation()
          onPromptStatusChange(prompt.id, NEXT_PROMPT_STATUS[prompt.status])
        }}
      >
        {prompt.status === "completed" ? (
          <CheckCircle2 className={`h-3.5 w-3.5 ${className}`} />
        ) : prompt.status === "in_progress" ? (
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-400/80" />
        ) : (
          <Circle className="h-3.5 w-3.5 text-white/30" />
        )}
      </LxIconButton>
    )
  }

  /**
   * 渲染名称或对应的行内编辑输入框。
   */
  const renderItemName = (
    item: { id: string; name: string },
    className: string,
  ): React.JSX.Element => {
    if (editingItem?.id !== item.id) {
      return <span className={`${className} select-none`}>{item.name}</span>
    }

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
   * 渲染可选择的条目节点。
   */
  const renderPrompt = (
    prompt: ProjectNavigationPrompt,
    isNested: boolean,
    showBranch: boolean,
  ): React.JSX.Element => {
    const isActive = activePromptId === prompt.id

    return (
      <div
        key={prompt.id}
        role="button"
        tabIndex={0}
        data-item-level="prompt"
        aria-current={isActive ? "page" : undefined}
        className={`flex h-7 w-full items-center gap-2 rounded-[6px] pr-2 text-left text-sm transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
          isNested ? "pl-3" : "pl-1.5"
        } ${isActive ? "bg-white/5 text-white" : "text-white/70"}`}
        onClick={() => {
          onItemOpen(prompt.id)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") event.currentTarget.click()
        }}
        onContextMenu={(event) => onOpenMenu(event, "prompt", prompt)}
      >
        {showBranch ? (
          <TreeBranchIcon />
        ) : (
          <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        )}
        <File className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-white/80" : "text-white/45"}`} />
        {renderItemName(
          prompt,
          prompt.status === "completed"
            ? "min-w-0 flex-1 truncate text-white/40 line-through"
            : "min-w-0 flex-1 truncate",
        )}
        {renderStatusIcon(prompt)}
      </div>
    )
  }

  /**
   * 渲染文件夹内条目，顺序由父组件按状态分组与排序键预先排好。
   */
  const renderFolderPrompts = (
    prompts: ProjectNavigationProject["projectFolders"][number]["prompts"],
  ): React.JSX.Element[] => prompts.map((prompt, index) => renderPrompt(prompt, true, index === 0))

  return (
    <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-2 [scrollbar-gutter:stable]">
      {projects.length > 0 &&
        projects.map((project) => {
          const isProjectCollapsed = searchKeyword ? false : !Boolean(collapsedProjects[project.id])

          return (
            <div key={project.id} className="space-y-1">
              <div
                role="button"
                tabIndex={0}
                data-item-level="project"
                className="group flex h-7 w-full items-center gap-1.5 rounded-[6px] px-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 hover:bg-white/10"
                aria-expanded={!isProjectCollapsed}
                onClick={() => onProjectToggle(project.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") event.currentTarget.click()
                }}
                onContextMenu={(event) => onOpenMenu(event, "project", project)}
              >
                <Boxes className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                {renderItemName(
                  project,
                  "min-w-0 flex-1 truncate text-sm font-semibold uppercase text-white/55 transition-colors",
                )}
                {isProjectCollapsed ? (
                  <>
                    <span className="text-xs text-white/35 group-hover:hidden">
                      {project.projectFolders.length}
                    </span>
                    <ChevronDown className="hidden h-3.5 w-3.5 -rotate-90 text-white/30 group-hover:block" />
                  </>
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-white/30 transition-transform" />
                )}
              </div>

              {!isProjectCollapsed && (
                <div className="space-y-0.5">
                  {project.projectFolders.map((folder) => {
                    const isFolderCollapsed = searchKeyword
                      ? false
                      : !Boolean(collapsedProjectFolders[folder.id])

                    return (
                      <div key={folder.id} className="space-y-0.5">
                        <div
                          role="button"
                          tabIndex={0}
                          data-item-level="folder"
                          className="group flex h-7 w-full items-center gap-1.5 rounded-[6px] pr-1 pl-1 text-left text-sm text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 hover:bg-white/10"
                          aria-expanded={!isFolderCollapsed}
                          onClick={() => onProjectFolderToggle(folder.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.currentTarget.click()
                            }
                          }}
                          onContextMenu={(event) =>
                            onOpenMenu(event, "project_folder", folder, project.id)
                          }
                        >
                          <TreeBranchIcon />
                          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
                          {renderItemName(folder, "min-w-0 flex-1 truncate")}
                          {isFolderCollapsed ? (
                            <>
                              <span className="text-xs text-white/35 group-hover:hidden">
                                {folder.prompts.length}
                              </span>
                              <ChevronDown className="hidden h-3.5 w-3.5 -rotate-90 text-white/30 group-hover:block" />
                            </>
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-white/30 transition-transform" />
                          )}
                        </div>
                        {!isFolderCollapsed && renderFolderPrompts(folder.prompts)}
                      </div>
                    )
                  })}
                  {project.prompts.map((prompt) => renderPrompt(prompt, false, true))}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
