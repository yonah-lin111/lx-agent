import {
  CheckCircle2,
  ChevronDown,
  Circle,
  File,
  Folder,
  FolderKanban,
  LoaderCircle,
} from "lucide-react"
import type React from "react"
import { useState } from "react"

import { LxIconButton } from "@/components/ui/LxIconButton"
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
 * 树形结构的直角分支图标。
 */
const TreeBranchIcon = (): React.JSX.Element => (
  <svg
    className="h-3.5 w-3.5 shrink-0 stroke-current text-white/30"
    viewBox="0 0 12 12"
    fill="none"
    aria-hidden="true"
  >
    <path d="M3 1v5h7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * 展示项目、文件夹和条目树，并管理文件夹内已完成条目的折叠状态。
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
  const [collapsedCompletedPromptGroups, setCollapsedCompletedPromptGroups] = useState<
    Record<string, boolean>
  >({})

  /**
   * 切换指定文件夹内已完成条目分组的展开状态。
   */
  const toggleCompletedPromptGroup = (projectFolderId: string): void => {
    setCollapsedCompletedPromptGroups((currentValue) => ({
      ...currentValue,
      [projectFolderId]: !(currentValue[projectFolderId] ?? true),
    }))
  }

  /**
   * 渲染条目状态图标，点击可循环切换状态。
   */
  const renderStatusIcon = (prompt: ProjectNavigationPrompt): React.JSX.Element => {
    const Icon =
      prompt.status === "completed"
        ? CheckCircle2
        : prompt.status === "in_progress"
          ? LoaderCircle
          : Circle
    const className =
      prompt.status === "completed"
        ? "text-emerald-400/80"
        : prompt.status === "in_progress"
          ? "animate-spin text-amber-400/80"
          : "text-white/30"

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
        <Icon className={`h-3.5 w-3.5 ${className}`} />
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
  ): React.JSX.Element => (
    <div
      key={prompt.id}
      role="button"
      tabIndex={0}
      className={`flex w-full items-center gap-2 rounded-[6px] py-1.5 pr-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
        isNested ? "pl-3" : "pl-1"
      } ${
        activePromptId === prompt.id
          ? "bg-white/10 text-white"
          : "text-white/65 hover:bg-white/[0.04] hover:text-white/90"
      }`}
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
      <File
        className={`h-3.5 w-3.5 shrink-0 ${
          activePromptId === prompt.id ? "text-white/70" : "text-white/30"
        }`}
      />
      {renderItemName(
        prompt,
        prompt.status === "completed"
          ? "min-w-0 flex-1 truncate text-white/40 line-through"
          : "min-w-0 flex-1 truncate",
      )}
      {renderStatusIcon(prompt)}
    </div>
  )

  /**
   * 渲染文件夹内未完成与已完成条目，已完成项默认折叠。
   */
  const renderFolderPrompts = (
    prompts: ProjectNavigationProject["projectFolders"][number]["prompts"],
    projectFolderId: string,
  ): React.JSX.Element[] => {
    const unfinishedPrompts = prompts.filter((prompt) => prompt.status !== "completed")
    const completedPrompts = prompts.filter((prompt) => prompt.status === "completed")
    const shouldAutoExpand =
      searchKeyword.length > 0 || completedPrompts.some((prompt) => prompt.id === activePromptId)
    const isCompletedGroupCollapsed = shouldAutoExpand
      ? false
      : (collapsedCompletedPromptGroups[projectFolderId] ?? true)
    const showCompletedGroupBranch = unfinishedPrompts.length === 0

    return [
      ...unfinishedPrompts.map((prompt, index) => renderPrompt(prompt, true, index === 0)),
      ...(completedPrompts.length > 0
        ? [
            <div key={`${projectFolderId}:completed`} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 pl-1">
                {showCompletedGroupBranch ? (
                  <TreeBranchIcon />
                ) : (
                  <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                )}
                <button
                  type="button"
                  className="cursor-pointer select-none text-sm font-medium text-white/35 transition-colors hover:text-white/60"
                  aria-expanded={!isCompletedGroupCollapsed}
                  onClick={() => toggleCompletedPromptGroup(projectFolderId)}
                >
                  {isCompletedGroupCollapsed
                    ? `显示 ${completedPrompts.length} 个已完成项...`
                    : `收起 ${completedPrompts.length} 个已完成项`}
                </button>
              </div>
              {!isCompletedGroupCollapsed &&
                completedPrompts.map((prompt) => renderPrompt(prompt, true, false))}
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
                  {project.projectFolders.map((folder) => {
                    const isFolderCollapsed = searchKeyword
                      ? false
                      : Boolean(collapsedProjectFolders[folder.id])

                    return (
                      <div key={folder.id} className="space-y-0.5">
                        <div
                          role="button"
                          tabIndex={0}
                          className="group flex w-full items-center gap-1.5 rounded-[6px] py-1 pr-1 pl-1 text-left text-sm text-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 hover:bg-white/[0.04] hover:text-white/85"
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
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-white/30 transition-transform ${isFolderCollapsed ? "-rotate-90" : ""}`}
                          />
                        </div>
                        {!isFolderCollapsed && renderFolderPrompts(folder.prompts, folder.id)}
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
