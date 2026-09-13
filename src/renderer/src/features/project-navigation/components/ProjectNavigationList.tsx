import {
  Boxes,
  CheckCircle2,
  ChevronDown,
  Circle,
  File,
  FileText,
  Folder,
  FolderGit,
} from "lucide-react"
import type React from "react"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { TreeBranchIcon } from "@/components/ui/TreeBranchIcon"
import type {
  EditingItem,
  ProjectNavigationMenuType,
  ProjectNavigationProject,
  ProjectNavigationPrompt,
  PromptStatus,
} from "@/features/project-navigation/types"
import { type TranslationKey, useTranslation } from "@/i18n"

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

// 状态对应的翻译键。
const PROMPT_STATUS_LABEL_KEYS: Record<PromptStatus, TranslationKey> = {
  todo: "agent.promptStatusTodo",
  in_progress: "agent.promptStatusInProgress",
  completed: "agent.promptStatusCompleted",
}

// 项目列表属性。
interface ProjectNavigationListProps {
  projects: ProjectNavigationProject[]
  searchKeyword: string
  activePromptId: string
  // 当前右键菜单目标 id（菜单打开期间保持触发节点 hover 高亮）。
  activeMenuId?: string | null
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
    item: {
      id: string
      name: string
      status?: PromptStatus
      isImported?: boolean
      path?: string
    },
    projectId?: string,
    depth?: number,
  ) => void
}

/**
 * 展示项目、文件夹和条目树，条目顺序由父组件按状态分组与排序键预先排好。
 */
export const ProjectNavigationList = ({
  projects,
  searchKeyword,
  activePromptId,
  activeMenuId,
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
  const { t } = useTranslation()

  /**
   * 渲染条目状态图标，点击可循环切换状态。
   */
  const renderStatusIcon = (prompt: ProjectNavigationPrompt): React.JSX.Element => {
    const className = prompt.status === "completed" ? "text-emerald-400/80" : "text-white/30"
    const labelKey = PROMPT_STATUS_LABEL_KEYS[prompt.status]

    return (
      <LxIconButton
        size="small"
        shape="circle"
        showHoverBg={false}
        aria-label={t("agent.toggleStatus")}
        title={{ content: t(labelKey) }}
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
   * 渲染项目根位置的专属临时提示词条目（不可删除，高亮背景，无状态切换）。
   */
  const renderTemporaryPrompt = (projectId: string): React.JSX.Element => {
    const tempPromptId = `temp-${projectId}`
    const isActive = activePromptId === tempPromptId

    return (
      <LxNavItem
        key={tempPromptId}
        depth={1}
        hoverable={false}
        data-item-variant="temp-prompt"
        aria-current={isActive ? "page" : undefined}
        className={`project-nav-temp-prompt border ${
          isActive
            ? "border-[var(--color-theme-accent,rgba(56,189,248,0.4))] bg-[rgba(56,189,248,0.2)] text-[var(--color-theme-text,#ffffff)] font-medium"
            : "border-[var(--color-theme-border,rgba(255,255,255,0.1))] bg-transparent text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))] hover:border-[var(--color-theme-border-strong,rgba(255,255,255,0.2))] hover:bg-white/5"
        }`}
        onClick={() => {
          onItemOpen(tempPromptId)
        }}
        prefix={
          <FileText
            className={`h-3.5 w-3.5 shrink-0 ${
              isActive
                ? "text-[var(--color-theme-accent,#38bdf8)]"
                : "text-[var(--color-theme-text-muted,rgba(255,255,255,0.5))]"
            }`}
          />
        }
      >
        <span className="min-w-0 flex-1 truncate select-none font-medium">
          {t("project.temporaryPrompt")}
        </span>
      </LxNavItem>
    )
  }

  /**
   * 渲染可选择的条目节点。
   */
  const renderPrompt = (
    prompt: ProjectNavigationPrompt,
    depth: number,
    projectId?: string,
  ): React.JSX.Element => {
    const isActive = activePromptId === prompt.id

    return (
      <LxNavItem
        key={prompt.id}
        depth={depth}
        level={3}
        data-menu-open={activeMenuId === prompt.id ? "true" : undefined}
        aria-current={isActive ? "page" : undefined}
        className={isActive ? "bg-white/5 text-white" : "text-white/70"}
        onClick={() => {
          onItemOpen(prompt.id)
        }}
        onContextMenu={(event) => onOpenMenu(event, "prompt", prompt, projectId, depth)}
        prefix={
          <File
            className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-white/80" : "text-white/45"}`}
          />
        }
        suffix={renderStatusIcon(prompt)}
      >
        {renderItemName(
          prompt,
          prompt.status === "completed"
            ? "min-w-0 flex-1 truncate text-white/40 line-through"
            : "min-w-0 flex-1 truncate",
        )}
      </LxNavItem>
    )
  }

  /**
   * 递归渲染文件夹节点及其子文件夹与条目。
   */
  const renderFolder = (
    folder: ProjectNavigationProject["projectFolders"][number],
    depth: number,
    projectId: string,
  ): React.JSX.Element => {
    const isFolderCollapsed = searchKeyword ? false : !Boolean(collapsedProjectFolders[folder.id])
    const totalChildCount = folder.projectFolders.length + folder.prompts.length

    return (
      <div key={folder.id} className="space-y-0.5">
        <LxNavItem
          depth={depth}
          level={2}
          data-menu-open={activeMenuId === folder.id ? "true" : undefined}
          className="text-white/70"
          aria-expanded={!isFolderCollapsed}
          onClick={() => onProjectFolderToggle(folder.id)}
          onContextMenu={(event) => onOpenMenu(event, "project_folder", folder, projectId, depth)}
          prefix={
            <>
              <TreeBranchIcon />
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
            </>
          }
          suffix={
            isFolderCollapsed ? (
              <>
                <span className="text-xs text-white/35 group-hover:hidden">{totalChildCount}</span>
                <ChevronDown className="hidden h-3.5 w-3.5 -rotate-90 text-white/30 group-hover:block" />
              </>
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-white/30 transition-transform" />
            )
          }
        >
          {renderItemName(folder, "min-w-0 flex-1 truncate")}
        </LxNavItem>
        {!isFolderCollapsed && (
          <>
            {folder.projectFolders.map((childFolder) =>
              renderFolder(childFolder, depth + 1, projectId),
            )}
            {folder.prompts.map((prompt) => renderPrompt(prompt, depth + 1, projectId))}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-2 [scrollbar-gutter:stable]">
      {projects.length > 0 &&
        projects.map((project) => {
          const isProjectCollapsed = searchKeyword ? false : !Boolean(collapsedProjects[project.id])

          return (
            <div key={project.id} className="space-y-1">
              <LxNavItem
                level={1}
                data-unimported={project.isImported === false ? "true" : undefined}
                data-menu-open={activeMenuId === project.id ? "true" : undefined}
                className={project.isImported === false ? "opacity-75" : ""}
                aria-expanded={!isProjectCollapsed}
                onClick={() => onProjectToggle(project.id)}
                onContextMenu={(event) => onOpenMenu(event, "project", project)}
                prefix={
                  project.isImported === false ? (
                    <FolderGit className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  ) : (
                    <Boxes className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                  )
                }
                suffix={
                  isProjectCollapsed ? (
                    <>
                      <span className="text-xs text-white/35 group-hover:hidden">
                        {project.projectFolders.length}
                      </span>
                      <ChevronDown className="hidden h-3.5 w-3.5 -rotate-90 text-white/30 group-hover:block" />
                    </>
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-white/30 transition-transform" />
                  )
                }
              >
                {renderItemName(
                  project,
                  `min-w-0 flex-1 truncate font-semibold uppercase transition-colors ${
                    project.isImported === false ? "text-white/40 font-normal" : "text-white/55"
                  }`,
                )}
              </LxNavItem>

              {!isProjectCollapsed && (
                <div className="space-y-0.5">
                  {renderTemporaryPrompt(project.id)}
                  {project.projectFolders.map((folder) => renderFolder(folder, 1, project.id))}
                  {project.prompts.map((prompt) => renderPrompt(prompt, 1, project.id))}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
