import { ChevronLeft, ChevronRight } from "lucide-react"
import React, { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { PRIMARY_NAVIGATION_ITEMS } from "@/lib/navigationItems"
import { useTranslation } from "@/i18n"

// 左侧栏属性。
interface LeftSideBarProps {
  children?: React.ReactNode
}

/**
 * 渲染可折叠的通用左侧栏容器。
 */
export const LeftSideBar = ({ children }: LeftSideBarProps): React.JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()

  useEffect(() => {
    setIsCollapsed(false)
  }, [pathname])

  return (
    <aside
      className={`relative flex h-40 shrink-0 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] transition-[width,max-width,min-width,padding] duration-300 ease-in-out lg:h-full ${
        isCollapsed
          ? "w-10 min-w-10 max-w-10 py-2 px-1"
          : "w-full min-w-full max-w-full p-2 lg:w-56 lg:min-w-56 lg:max-w-56"
      }`}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <div key={pathname} className="h-full animate-sidebar-content-slide-in">
          {React.isValidElement(children)
            ? React.cloneElement(children, { isCollapsed } as Record<string, unknown>)
            : children}
        </div>
      </div>
      <LxIconButton
        className={`absolute top-2 left-1 transition-transform duration-300 ease-in-out ${
          isCollapsed ? "translate-x-[2px]" : "translate-x-0"
        }`}
        aria-label={isCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
        title={{
          content: isCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar"),
          placement: "right",
        }}
        onClick={() => setIsCollapsed((currentValue) => !currentValue)}
        size="small"
      >
        {isCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </LxIconButton>
      <div
        className={`mt-2 flex shrink-0 gap-1 transition-transform duration-300 ease-in-out ${
          isCollapsed
            ? "items-center -translate-x-[1px] flex-col"
            : "translate-x-0 flex-row justify-center"
        }`}
      >
        {PRIMARY_NAVIGATION_ITEMS.map(({ icon: Icon, labelKey, path }) => {
          const isActive = pathname === path
          const label = t(labelKey)
          return (
            <LxIconButton
              key={path}
              aria-current={isActive ? "page" : undefined}
              aria-label={t("nav.openPage", { name: label })}
              title={{ content: label, placement: isCollapsed ? "right" : "top" }}
              highlighted={isActive}
              onClick={() => navigate(path)}
              size="small"
            >
              <Icon className="h-3.5 w-3.5" />
            </LxIconButton>
          )
        })}
      </div>
    </aside>
  )
}
