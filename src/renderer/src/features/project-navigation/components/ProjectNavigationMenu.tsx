import { Check, Edit3, Plus, Trash2 } from "lucide-react"
import type React from "react"
import { useEffect, useState } from "react"

import { LxMenu, LxMenuItem, LxMenuSeparator } from "@/components/ui/LxMenu"
import type { ProjectNavigationMenuType, PromptStatus } from "@/features/project-navigation/types"

export type { ProjectNavigationMenuType, PromptStatus } from "@/features/project-navigation/types"

type ProjectNavigationMenuProps = {
  isOpen: boolean
  type: ProjectNavigationMenuType
  title: string
  x: number
  y: number
  status?: PromptStatus
  onEditProject?: () => void
  onRename: () => void
  onAddModule?: () => void
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
  status?: PromptStatus
}

// 提示词状态配置。
const STATUS_OPTIONS: { value: PromptStatus; label: string; className: string }[] = [
  { value: "todo", label: "待处理", className: "bg-white/40" },
  { value: "in_progress", label: "进行中", className: "bg-amber-400/80" },
  { value: "completed", label: "已完成", className: "bg-emerald-400/80" },
]

/**
 * 展示项目、模块与提示词的右键操作菜单。
 */
export const ProjectNavigationMenu = ({
  isOpen,
  type,
  title,
  x,
  y,
  status,
  onEditProject,
  onRename,
  onAddModule,
  onAddPrompt,
  onStatusChange,
  onDelete,
  onClose,
}: ProjectNavigationMenuProps): React.JSX.Element | null => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false)
  const [lastMenu, setLastMenu] = useState<MenuDisplayState>({
    type: "project",
    title: "",
    x: 0,
    y: 0,
  })
  const displayedMenu: MenuDisplayState = isOpen ? { type, title, x, y, status } : lastMenu

  useEffect(() => {
    if (isOpen) setLastMenu({ type, title, x, y, status })
  }, [isOpen, status, title, type, x, y])

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
        {displayedMenu.type === "project" ? "编辑项目" : "重命名"}
      </LxMenuItem>

      {displayedMenu.type === "project" ? (
        <LxMenuItem leading={<Plus className="h-3.5 w-3.5 text-white/45" />} onClick={onAddModule}>
          新增模块
        </LxMenuItem>
      ) : null}

      {displayedMenu.type !== "prompt" ? (
        <LxMenuItem leading={<Plus className="h-3.5 w-3.5 text-white/45" />} onClick={onAddPrompt}>
          新增提示词
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
                {option.label}
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
          ? "确认删除"
          : `删除${displayedMenu.type === "project" ? "项目" : displayedMenu.type === "module" ? "模块" : "提示词"}`}
      </LxMenuItem>
    </LxMenu>
  )
}
