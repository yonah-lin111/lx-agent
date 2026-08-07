import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { UI_SECTIONS } from "@/features/ui-preview"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

export interface UiLeftSideBarProps {
  isCollapsed?: boolean
}

/**
 * 渲染 UI 组件预览页面专属左侧栏内容。
 */
export const UiLeftSideBar = ({ isCollapsed = false }: UiLeftSideBarProps): React.JSX.Element => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [isSectionExpanded, setIsSectionExpanded] = useState(true)
  const activeSection = searchParams.get("section") ?? UI_SECTIONS[0].id

  if (isCollapsed) {
    return (
      <div className="flex h-full min-w-0 flex-col gap-3 items-center">
        <div className="flex h-7 shrink-0 items-center justify-end px-1" />
        <nav
          className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-0.5 pb-2"
          aria-label="UI 组件分区"
        >
          {UI_SECTIONS.map((section) => {
            const isActive = activeSection === section.id
            const Icon = section.icon
            return (
              <LxIconButton
                key={section.id}
                aria-current={isActive ? "page" : undefined}
                aria-label={section.label}
                title={{ content: section.label, placement: "right" }}
                highlighted={isActive}
                hoverBgClass="hover:bg-white/10"
                hoverTextClass="hover:text-white"
                onClick={() => navigate(`${PAGE_ROUTES.ui}?section=${section.id}`)}
              >
                <Icon className="h-3.5 w-3.5" />
              </LxIconButton>
            )
          })}
        </nav>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-3">
      <div className="flex h-7 shrink-0 items-center justify-end px-1" />
      <nav
        className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-2"
        aria-label="UI 组件分区"
      >
        <button
          type="button"
          aria-expanded={isSectionExpanded}
          className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-xs font-semibold text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
          onClick={() => setIsSectionExpanded((current) => !current)}
        >
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${
              isSectionExpanded ? "rotate-0" : "-rotate-90"
            }`}
          />
          <span className="truncate">Common Components</span>
        </button>
        {isSectionExpanded ? (
          <div className="space-y-1">
            {UI_SECTIONS.map((section) => {
              const isActive = activeSection === section.id
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/65 hover:bg-white/[0.04] hover:text-white/90"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => navigate(`${PAGE_ROUTES.ui}?section=${section.id}`)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{section.label}</span>
                </button>
              )
            })}
          </div>
        ) : null}
      </nav>
    </div>
  )
}
