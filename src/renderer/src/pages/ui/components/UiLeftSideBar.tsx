import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { LxNavItem } from "@/components/ui/LxNavItem"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { UI_SECTION_GROUPS, UI_SECTIONS } from "@/features/ui-preview"
import { useTranslation } from "@/i18n"
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
  const { t } = useTranslation()
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(UI_SECTION_GROUPS.map((group) => [group.id, true])),
  )
  const activeSection = searchParams.get("section") ?? UI_SECTIONS[0].id

  /**
   * 切换分组展开状态。
   */
  const toggleGroup = (groupId: string): void => {
    setExpandedGroupIds((current) => ({ ...current, [groupId]: !current[groupId] }))
  }

  if (isCollapsed) {
    return (
      <div className="flex h-full min-w-0 flex-col gap-3 items-center">
        <div className="flex h-7 shrink-0 items-center justify-end px-1" />
        <nav
          className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-0.5 pb-2 [scrollbar-gutter:stable]"
          aria-label={t("uiPreview.sidebarAria")}
        >
          {UI_SECTIONS.map((section) => {
            const isActive = activeSection === section.id
            const Icon = section.icon
            return (
              <LxTooltip key={section.id} content={section.label} placement="right">
                <LxNavItem
                  aria-current={isActive ? "page" : undefined}
                  aria-label={section.label}
                  className={`w-full justify-center ${
                    isActive ? "bg-white/5 text-white" : "text-white/70"
                  }`}
                  onClick={() => navigate(`${PAGE_ROUTES.ui}?section=${section.id}`)}
                  prefix={<Icon className="h-3.5 w-3.5 shrink-0" />}
                />
              </LxTooltip>
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
        className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-2 [scrollbar-gutter:stable]"
        aria-label={t("uiPreview.sidebarAria")}
      >
        {UI_SECTION_GROUPS.map((group) => {
          const isGroupExpanded = expandedGroupIds[group.id] ?? true
          const groupHasActive = group.sections.some((section) => section.id === activeSection)
          const GroupIcon = group.icon
          return (
            <div key={group.id} className="space-y-1">
              <LxNavItem
                level={1}
                aria-expanded={isGroupExpanded}
                className={`font-semibold ${groupHasActive ? "text-white" : "text-white/45"}`}
                onClick={() => toggleGroup(group.id)}
                prefix={
                  <GroupIcon
                    className={`h-3.5 w-3.5 shrink-0 ${groupHasActive ? "text-white" : ""}`}
                  />
                }
                suffix={
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${
                      isGroupExpanded ? "rotate-0" : "-rotate-90"
                    }`}
                  />
                }
              >
                <span className="min-w-0 flex-1 truncate">{t(group.labelKey)}</span>
              </LxNavItem>
              {isGroupExpanded ? (
                <div className="space-y-1">
                  {group.sections.map((section) => {
                    const isActive = activeSection === section.id
                    const Icon = section.icon
                    return (
                      <LxNavItem
                        key={section.id}
                        level={3}
                        depth={1}
                        aria-current={isActive ? "page" : undefined}
                        className={isActive ? "bg-white/5 text-white" : "text-white/70"}
                        onClick={() => navigate(`${PAGE_ROUTES.ui}?section=${section.id}`)}
                        prefix={<Icon className="h-3.5 w-3.5 shrink-0" />}
                      >
                        <span className="min-w-0 flex-1 truncate">{section.label}</span>
                      </LxNavItem>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>
    </div>
  )
}
