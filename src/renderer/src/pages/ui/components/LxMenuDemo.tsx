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
import { useTranslation } from "@/i18n"
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
export const LxMenuDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.menuContainer")}
        description={t("uiPreview.demos.menuContainerDesc")}
      >
        <MenuTrigger
          buttonLabel={t("uiPreview.demos.openMenu")}
          ariaLabel={t("uiPreview.demos.exampleMenu")}
        >
          <LxMenuItem leading={<Copy className="h-3.5 w-3.5" />}>{t("common.copy")}</LxMenuItem>
          <LxMenuItem
            leading={<Pencil className="h-3.5 w-3.5" />}
            trailing={<span className="text-white/30">⌘E</span>}
          >
            {t("common.edit")}
          </LxMenuItem>
          <LxMenuSeparator />
          <LxMenuItem danger leading={<Trash2 className="h-3.5 w-3.5" />}>
            {t("common.delete")}
          </LxMenuItem>
        </MenuTrigger>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.menuItemStates")}
        description={t("uiPreview.demos.menuItemStatesDesc")}
      >
        <div className="flex flex-wrap gap-2">
          <MenuTrigger
            buttonLabel={t("uiPreview.demos.statusMenu")}
            ariaLabel={t("uiPreview.demos.statusMenu")}
          >
            <LxMenuItem leading={<Monitor className="h-3.5 w-3.5" />}>
              {t("uiPreview.demos.defaultDisplay")}
            </LxMenuItem>
            <LxMenuItem leading={<Moon className="h-3.5 w-3.5" />}>
              {t("uiPreview.demos.darkMode")}
            </LxMenuItem>
            <LxMenuSeparator />
            <LxMenuItem
              aria-checked="true"
              leading={<span className="h-2 w-2 rounded-full bg-white/60" />}
              menuRole="menuitemradio"
              trailing={<Check className="h-3.5 w-3.5 text-white/70" />}
            >
              {t("uiPreview.demos.compactLayout")}
            </LxMenuItem>
            <LxMenuItem
              aria-checked="false"
              leading={<span className="h-2 w-2 rounded-full bg-white/30" />}
              menuRole="menuitemradio"
            >
              {t("uiPreview.demos.comfortableLayout")}
            </LxMenuItem>
          </MenuTrigger>
          <MenuTrigger
            buttonLabel={t("uiPreview.demos.actionMenu")}
            ariaLabel={t("uiPreview.demos.actionMenu")}
          >
            <LxMenuItem leading={<FileText className="h-3.5 w-3.5" />}>
              {t("uiPreview.demos.newFile")}
            </LxMenuItem>
            <LxMenuItem leading={<FolderOpen className="h-3.5 w-3.5" />}>
              {t("uiPreview.demos.openFolder")}
            </LxMenuItem>
            <LxMenuSeparator />
            <LxMenuItem danger leading={<LogOut className="h-3.5 w-3.5" />}>
              {t("uiPreview.demos.logout")}
            </LxMenuItem>
          </MenuTrigger>
        </div>
      </UiPreviewSection>
    </div>
  )
}
