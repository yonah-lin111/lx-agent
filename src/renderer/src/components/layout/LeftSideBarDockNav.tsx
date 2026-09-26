import type React from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"
import { PRIMARY_NAVIGATION_ITEMS } from "@/lib/navigationItems"
import { useDockMagnify } from "@/lib/useDockMagnify"

// 导航图标放大上限倍率。
const DOCK_MAX_SCALE = 1.5
// 光标影响半径（像素）。
const DOCK_INFLUENCE_RADIUS_PX = 56

// 底部导航属性。
interface LeftSideBarDockNavProps {
  // 侧栏是否折叠：折叠态为纵向静态列表，不启用放大。
  isCollapsed: boolean
}

/**
 * 渲染主导航项，并在展开态提供 macOS Dock 式光标跟随放大效果。
 */
export const LeftSideBarDockNav = ({ isCollapsed }: LeftSideBarDockNavProps): React.JSX.Element => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { containerRef, registerItem, handlePointerMove, resetTransforms } =
    useDockMagnify<HTMLDivElement>({
      enabled: !isCollapsed,
      axis: "x",
      maxScale: DOCK_MAX_SCALE,
      influenceRadiusPx: DOCK_INFLUENCE_RADIUS_PX,
      origin: "bottom",
    })

  return (
    <div
      ref={containerRef}
      className={`sidebar-dock-nav mt-2 flex shrink-0 gap-1 transition-transform duration-300 ease-in-out ${
        isCollapsed
          ? "items-center -translate-x-[1px] flex-col"
          : "translate-x-0 flex-row justify-center"
      }`}
      onPointerCancel={resetTransforms}
      onPointerLeave={resetTransforms}
      onPointerMove={handlePointerMove}
    >
      {PRIMARY_NAVIGATION_ITEMS.map(({ icon: Icon, labelKey, path }) => {
        const isActive = pathname === path
        const label = t(labelKey)
        return (
          <span
            key={path}
            ref={(node) => {
              registerItem(path, node)
            }}
            className="sidebar-dock-item flex will-change-transform"
          >
            <LxIconButton
              aria-current={isActive ? "page" : undefined}
              aria-label={t("nav.openPage", { name: label })}
              title={{ content: label, placement: isCollapsed ? "right" : "top" }}
              highlighted={isActive}
              onClick={() => navigate(path)}
              size="small"
            >
              <Icon />
            </LxIconButton>
          </span>
        )
      })}
    </div>
  )
}
