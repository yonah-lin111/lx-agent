import { ChevronLeft, ChevronRight } from "lucide-react"
import React, { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { PRIMARY_NAVIGATION_ITEMS } from "@/lib/navigationItems"

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

  useEffect(() => {
    setIsCollapsed(false)
  }, [pathname])

  return (
    <aside
      className={`relative h-40 shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] transition-[width,max-width,min-width,padding] duration-300 ease-in-out lg:h-full ${
        isCollapsed
          ? "w-10 min-w-10 max-w-10 py-2 px-1"
          : "w-full min-w-full max-w-full p-2 lg:w-56 lg:min-w-56 lg:max-w-56"
      }`}
    >
      <div className="h-full overflow-hidden">
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
        aria-label={isCollapsed ? "展开左侧栏" : "折叠左侧栏"}
        title={{ content: isCollapsed ? "展开左侧栏" : "折叠左侧栏", placement: "right" }}
        onClick={() => setIsCollapsed((currentValue) => !currentValue)}
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </LxIconButton>
      <div
        className={`absolute bottom-2 flex gap-1 transition-transform duration-300 ease-in-out ${
          isCollapsed
            ? "left-1/2 -translate-x-1/2 flex-col"
            : "left-1 right-1 translate-x-0 flex-row justify-center"
        }`}
      >
        {PRIMARY_NAVIGATION_ITEMS.map(({ icon: Icon, label, path }) => {
          const isActive = pathname === path
          return (
            <LxIconButton
              key={path}
              aria-current={isActive ? "page" : undefined}
              aria-label={`打开${label}页面`}
              title={{ content: label, placement: isCollapsed ? "right" : "top" }}
              highlighted={isActive}
              hoverBgClass="hover:bg-white/10"
              hoverTextClass="hover:text-white"
              onClick={() => navigate(path)}
            >
              <Icon className="h-3.5 w-3.5" />
            </LxIconButton>
          )
        })}
      </div>
    </aside>
  )
}
