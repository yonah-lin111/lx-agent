import { Copy, Edit3, Trash2 } from "lucide-react"
import type React from "react"
import { useEffect, useState } from "react"
import { LxMenu, LxMenuSeparator } from "@/components/ui/LxMenu"
import { LxMenuItem } from "@/components/ui/LxMenuItem"
import { useTranslation } from "@/i18n"

// Skill 文件右键菜单属性。
export interface SkillFileMenuProps {
  isOpen: boolean
  // 滚动关闭锚点：触发菜单的文件行节点。
  anchor?: HTMLElement | null
  title: string
  x: number
  y: number
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
  onClose: () => void
}

// 菜单退出动画期间保留的展示数据。
type MenuDisplayState = {
  title: string
  x: number
  y: number
}

/**
 * 渲染 Skill 附加文件的右键操作菜单（重命名、复制副本、删除）。
 */
export const SkillFileMenu = ({
  isOpen,
  anchor,
  title,
  x,
  y,
  onRename,
  onDuplicate,
  onDelete,
  onClose,
}: SkillFileMenuProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false)
  const [lastMenu, setLastMenu] = useState<MenuDisplayState>({ title: "", x: 0, y: 0 })
  const displayedMenu: MenuDisplayState = isOpen ? { title, x, y } : lastMenu

  useEffect(() => {
    if (isOpen) setLastMenu({ title, x, y })
  }, [isOpen, title, x, y])

  useEffect(() => {
    setIsConfirmingDelete(false)
  }, [isOpen, title])

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
      ariaLabel={t("settings.skillsFileMenuLabel", { name: displayedMenu.title })}
      anchor={anchor ?? null}
      isOpen={isOpen}
      x={displayedMenu.x}
      y={displayedMenu.y}
      onClose={onClose}
    >
      <LxMenuItem leading={<Edit3 className="h-3.5 w-3.5 text-white/45" />} onClick={onRename}>
        {t("settings.skillsFileRename")}
      </LxMenuItem>

      <LxMenuItem leading={<Copy className="h-3.5 w-3.5 text-white/45" />} onClick={onDuplicate}>
        {t("settings.skillsFileDuplicate")}
      </LxMenuItem>

      <LxMenuSeparator />

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
        {isConfirmingDelete ? t("common.confirmDelete") : t("common.delete")}
      </LxMenuItem>
    </LxMenu>
  )
}
