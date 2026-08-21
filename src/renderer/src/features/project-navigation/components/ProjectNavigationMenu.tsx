import { Check, Edit3, FilePlus, FolderPlus, Trash2 } from "lucide-react"
import type React from "react"
import { useEffect, useState } from "react"

import { LxMenu, LxMenuItem, LxMenuSeparator } from "@/components/ui/LxMenu"
import type { ProjectNavigationMenuType, PromptStatus } from "@/features/project-navigation/types"
import { type TranslationKey, useTranslation } from "@/i18n"

export type { ProjectNavigationMenuType, PromptStatus } from "@/features/project-navigation/types"

type ProjectNavigationMenuProps = {
  isOpen: boolean
  type: ProjectNavigationMenuType
  title: string
  x: number
  y: number
  depth?: number
  status?: PromptStatus
  onEditProject?: () => void
  onRename: () => void
  onAddFolder?: () => void
  onAddPrompt?: () => void
  onStatusChange?: (status: PromptStatus) => void
  onDelete: () => void
  onClose: () => void
}

// 菜单退出动画期间保留的展示数据。
type MenuDisplayState = {
  type: ProjectNavigationMenuType
  title: string
  x: number
  y: number
  depth?: number
  status?: PromptStatus
}

// 条目状态配置。
const STATUS_OPTIONS: { value: PromptStatus; labelKey: TranslationKey; className: string }[] = [
  { value: "todo", labelKey: "agent.promptStatusTodo", className: "bg-white/40" },
  { value: "in_progress", labelKey: "agent.promptStatusInProgress", className: "bg-amber-400/80" },
  { value: "completed", labelKey: "agent.promptStatusCompleted", className: "bg-emerald-400/80" },
]

/**
 * 展示项目、文件夹与条目的右键操作菜单。
 */
export const ProjectNavigationMenu = ({
  isOpen,
  type,
  title,
  x,
  y,
  depth,
  status,
  onEditProject,
  onRename,
  onAddFolder,
  onAddPrompt,
  onStatusChange,
  onDelete,
  onClose,
}: ProjectNavigationMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false)
  const [lastMenu, setLastMenu] = useState<MenuDisplayState>({
    type: "project",
    title: "",
    x: 0,
    y: 0,
  })
  const displayedMenu: MenuDisplayState = isOpen ? { type, title, x, y, depth, status } : lastMenu

  useEffect(() => {
    if (isOpen) setLastMenu({ type, title, x, y, depth, status })
  }, [isOpen, status, title, type, x, y, depth])

  useEffect(() => {
    setIsConfirmingDelete(false)
  }, [isOpen, title, type])

  /**
   * 第一次点击进入确认态，第二次点击才真正删除。
   */
  const handleDeleteClick = (): void => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true)
      return
    }

    onDelete()
  }

  const canAddFolder =
    displayedMenu.type === "project" ||
    (displayedMenu.type === "project_folder" && (displayedMenu.depth ?? 1) < 2)

  return (
    <LxMenu
      ariaLabel={`${displayedMenu.title} action menu`}
      isOpen={isOpen}
      x={displayedMenu.x}
      y={displayedMenu.y}
      onClose={onClose}
    >
      <LxMenuItem
        leading={<Edit3 className="h-3.5 w-3.5 text-white/45" />}
        onClick={displayedMenu.type === "project" ? onEditProject : onRename}
      >
        {displayedMenu.type === "project" ? t("project.editProject") : t("common.edit")}
      </LxMenuItem>

      {canAddFolder ? (
        <LxMenuItem
          leading={<FolderPlus className="h-3.5 w-3.5 text-white/45" />}
          onClick={onAddFolder}
        >
          {t("project.addFolderMenu")}
        </LxMenuItem>
      ) : null}

      {displayedMenu.type !== "prompt" ? (
        <LxMenuItem
          leading={<FilePlus className="h-3.5 w-3.5 text-white/45" />}
          onClick={onAddPrompt}
        >
          {t("project.addPromptMenu")}
        </LxMenuItem>
      ) : null}

      {displayedMenu.type === "prompt" && displayedMenu.status && onStatusChange ? (
        <>
          <LxMenuSeparator />
          {STATUS_OPTIONS.map((option) => {
            const isSelected = option.value === displayedMenu.status

            return (
              <LxMenuItem
                key={option.value}
                aria-checked={isSelected}
                leading={<span className={`h-2 w-2 rounded-full ${option.className}`} />}
                menuRole="menuitemradio"
                onClick={() => onStatusChange(option.value)}
                trailing={isSelected ? <Check className="h-3.5 w-3.5 text-white/70" /> : null}
              >
                {t(option.labelKey)}
              </LxMenuItem>
            )
          })}
          <LxMenuSeparator />
        </>
      ) : null}

      <LxMenuItem
        active={isConfirmingDelete}
        danger
        leading={
          <Trash2
            className={`h-3.5 w-3.5 ${isConfirmingDelete ? "text-white" : "text-rose-400/80"}`}
          />
        }
        onClick={handleDeleteClick}
      >
        {isConfirmingDelete
          ? t("common.confirmDelete")
          : displayedMenu.type === "project"
            ? t("project.deleteProject")
            : displayedMenu.type === "project_folder"
              ? t("project.deleteFolder")
              : t("project.deleteItem")}
      </LxMenuItem>
    </LxMenu>
  )
}
