import { Check, Edit3, Plus, Trash2 } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

export type LeftSideBarContextMenuType = "project" | "module" | "prompt"

export type PromptStatus = "todo" | "in_progress" | "completed"

type LeftSideBarContextMenuProps = {
  type: LeftSideBarContextMenuType
  title: string
  x: number
  y: number
  status?: PromptStatus
  onRename: () => void
  onAddModule?: () => void
  onAddPrompt?: () => void
  onStatusChange?: (status: PromptStatus) => void
  onDelete: () => void
  onClose: () => void
}

// 菜单宽度，用于把右键菜单限制在视口内。
const MENU_WIDTH = 156

// 菜单与视口边缘的最小距离。
const VIEWPORT_PADDING = 8

// 提示词状态配置。
const STATUS_OPTIONS: { value: PromptStatus; label: string; className: string }[] = [
  { value: "todo", label: "待处理", className: "bg-white/40" },
  { value: "in_progress", label: "进行中", className: "bg-amber-400/80" },
  { value: "completed", label: "已完成", className: "bg-emerald-400/80" },
]

/**
 * 把菜单坐标限制在当前视口内。
 */
const getMenuPosition = (x: number, y: number, type: LeftSideBarContextMenuType) => {
  const menuHeight = type === "prompt" ? 238 : type === "project" ? 158 : 120
  const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING)
  const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - menuHeight - VIEWPORT_PADDING)

  return {
    left: Math.min(Math.max(x, VIEWPORT_PADDING), maxLeft),
    top: Math.min(Math.max(y, VIEWPORT_PADDING), maxTop),
  }
}

/**
 * 展示项目、模块与提示词的右键操作菜单。
 */
export const LeftSideBarContextMenu = ({
  type,
  title,
  x,
  y,
  status,
  onRename,
  onAddModule,
  onAddPrompt,
  onStatusChange,
  onDelete,
  onClose,
}: LeftSideBarContextMenuProps): React.JSX.Element => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const position = getMenuPosition(x, y, type)

  useEffect(() => {
    setIsConfirmingDelete(false)
  }, [title, type])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

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

  return createPortal(
    <div
      ref={menuRef}
      aria-label={`${title} action menu`}
      className="fixed z-[9999] w-[156px] rounded-[6px] border border-white/10 bg-[#212121] p-1 shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
      role="menu"
      style={position}
    >
      <button
        className="flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-left text-xs text-white/75 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/45"
        role="menuitem"
        type="button"
        onClick={onRename}
      >
        <Edit3 className="h-3.5 w-3.5 text-white/45" />
        <span>{type === "project" ? "编辑项目" : "重命名"}</span>
      </button>

      {type === "project" ? (
        <button
          className="flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-left text-xs text-white/75 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/45"
          role="menuitem"
          type="button"
          onClick={onAddModule}
        >
          <Plus className="h-3.5 w-3.5 text-white/45" />
          <span>新增模块</span>
        </button>
      ) : null}

      {type !== "prompt" ? (
        <button
          className="flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-left text-xs text-white/75 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/45"
          role="menuitem"
          type="button"
          onClick={onAddPrompt}
        >
          <Plus className="h-3.5 w-3.5 text-white/45" />
          <span>新增提示词</span>
        </button>
      ) : null}

      {type === "prompt" && status && onStatusChange ? (
        <>
          <div className="my-1 border-t border-white/8" />
          {STATUS_OPTIONS.map((option) => {
            const isSelected = option.value === status

            return (
              <button
                key={option.value}
                aria-checked={isSelected}
                className="flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-left text-xs text-white/75 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/45"
                role="menuitemradio"
                type="button"
                onClick={() => onStatusChange(option.value)}
              >
                <span className={`h-2 w-2 rounded-full ${option.className}`} />
                <span className="flex-1">{option.label}</span>
                {isSelected ? <Check className="h-3.5 w-3.5 text-white/70" /> : null}
              </button>
            )
          })}
          <div className="my-1 border-t border-white/8" />
        </>
      ) : null}

      <button
        className={`flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-left text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400/45 ${
          isConfirmingDelete
            ? "bg-rose-600 text-white hover:bg-rose-500"
            : "text-rose-400/80 hover:bg-rose-400/10 hover:text-rose-300"
        }`}
        role="menuitem"
        type="button"
        onClick={handleDeleteClick}
      >
        <Trash2
          className={`h-3.5 w-3.5 ${isConfirmingDelete ? "text-white" : "text-rose-400/80"}`}
        />
        <span>
          {isConfirmingDelete
            ? "确认删除"
            : `删除${type === "project" ? "项目" : type === "module" ? "模块" : "提示词"}`}
        </span>
      </button>
    </div>,
    document.body,
  )
}
