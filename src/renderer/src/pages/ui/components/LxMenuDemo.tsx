import {
  Check,
  Copy,
  FileText,
  FolderOpen,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Trash2,
} from "lucide-react"
import type React from "react"
import { useState } from "react"

import { LxMenu, LxMenuItem, LxMenuSeparator } from "@/components/ui/LxMenu"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

// 单个菜单触发演示属性。
interface MenuTriggerProps {
  buttonLabel: string
  ariaLabel: string
  children: React.ReactNode
}

/**
 * 渲染带独立开关状态的菜单触发演示。
 */
const MenuTrigger = ({ buttonLabel, ariaLabel, children }: MenuTriggerProps): React.JSX.Element => {
  const [menuState, setMenuState] = useState({ isOpen: false, x: 0, y: 0 })

  /**
   * 根据触发按钮位置打开菜单。
   */
  const openMenu = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    setMenuState({ isOpen: true, x: rect.right - 8, y: rect.bottom + 4 })
  }

  return (
    <>
      <UiActionButton onClick={openMenu}>{buttonLabel}</UiActionButton>
      <LxMenu
        isOpen={menuState.isOpen}
        x={menuState.x}
        y={menuState.y}
        ariaLabel={ariaLabel}
        onClose={() => setMenuState((state) => ({ ...state, isOpen: false }))}
      >
        {children}
      </LxMenu>
    </>
  )
}

/**
 * 预览 LxMenu 组件。
 */
export const LxMenuDemo = (): React.JSX.Element => (
  <div className="flex flex-col gap-4">
    <UiPreviewSection title="菜单容器" description="点击触发按钮弹出，支持 Esc 与外部点击关闭">
      <MenuTrigger buttonLabel="打开菜单" ariaLabel="示例菜单">
        <LxMenuItem leading={<Copy className="h-3.5 w-3.5" />}>复制</LxMenuItem>
        <LxMenuItem
          leading={<Pencil className="h-3.5 w-3.5" />}
          trailing={<span className="text-white/30">⌘E</span>}
        >
          重命名
        </LxMenuItem>
        <LxMenuSeparator />
        <LxMenuItem danger leading={<Trash2 className="h-3.5 w-3.5" />}>
          删除
        </LxMenuItem>
      </MenuTrigger>
    </UiPreviewSection>
    <UiPreviewSection title="菜单项状态" description="radio 单选态、前缀图标与危险操作">
      <div className="flex flex-wrap gap-2">
        <MenuTrigger buttonLabel="状态菜单" ariaLabel="状态菜单">
          <LxMenuItem leading={<Monitor className="h-3.5 w-3.5" />}>默认显示</LxMenuItem>
          <LxMenuItem leading={<Moon className="h-3.5 w-3.5" />}>深色模式</LxMenuItem>
          <LxMenuSeparator />
          <LxMenuItem
            aria-checked="true"
            leading={<span className="h-2 w-2 rounded-full bg-white/60" />}
            menuRole="menuitemradio"
            trailing={<Check className="h-3.5 w-3.5 text-white/70" />}
          >
            紧凑布局
          </LxMenuItem>
          <LxMenuItem
            aria-checked="false"
            leading={<span className="h-2 w-2 rounded-full bg-white/30" />}
            menuRole="menuitemradio"
          >
            舒适布局
          </LxMenuItem>
        </MenuTrigger>
        <MenuTrigger buttonLabel="操作菜单" ariaLabel="操作菜单">
          <LxMenuItem leading={<FileText className="h-3.5 w-3.5" />}>新建文件</LxMenuItem>
          <LxMenuItem leading={<FolderOpen className="h-3.5 w-3.5" />}>打开文件夹</LxMenuItem>
          <LxMenuSeparator />
          <LxMenuItem danger leading={<LogOut className="h-3.5 w-3.5" />}>
            退出登录
          </LxMenuItem>
        </MenuTrigger>
      </div>
    </UiPreviewSection>
  </div>
)
