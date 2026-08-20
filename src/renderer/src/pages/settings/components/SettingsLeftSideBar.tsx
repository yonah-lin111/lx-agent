import { useNavigate, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { SETTINGS_SECTIONS } from "@/features/settings"

export interface SettingsLeftSideBarProps {
  isCollapsed?: boolean
}

/**
 * 渲染设置页面专属左侧栏内容。
 */
export const SettingsLeftSideBar = ({
  isCollapsed = false,
}: SettingsLeftSideBarProps): React.JSX.Element => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeSection = searchParams.get("section") ?? SETTINGS_SECTIONS[0].id

  if (isCollapsed) {
    return (
      <div className="flex h-full min-w-0 flex-col gap-3 items-center">
        <div className="flex h-7 shrink-0 items-center justify-end px-1" />
        <nav
          className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-0.5 pb-2"
          aria-label="设置分区"
        >
          {SETTINGS_SECTIONS.map((section) => {
            const isActive = activeSection === section.id
            const Icon = section.icon
            return (
              <LxIconButton
                key={section.id}
                aria-current={isActive ? "page" : undefined}
                aria-label={section.label}
                title={{ content: section.label, placement: "right" }}
                highlighted={isActive}
                onClick={() => navigate(`/settings?section=${section.id}`)}
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
        aria-label="设置分区"
      >
        {SETTINGS_SECTIONS.map((section) => {
          const isActive = activeSection === section.id
          const Icon = section.icon
          return (
            <button
              key={section.id}
              type="button"
              className={`flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-sm transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
                isActive ? "bg-white/5 text-white" : "text-white/70"
              }`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => navigate(`/settings?section=${section.id}`)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{section.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
