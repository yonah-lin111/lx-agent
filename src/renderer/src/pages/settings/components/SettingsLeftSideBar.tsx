import { useNavigate, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { SETTINGS_SECTIONS, useSettingsDirtyState } from "@/features/settings"
import { useTranslation } from "@/i18n"

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
  const { t } = useTranslation()
  const activeSection = searchParams.get("section") ?? SETTINGS_SECTIONS[0].id
  const dirtyMap = useSettingsDirtyState()

  if (isCollapsed) {
    return (
      <div className="flex h-full min-w-0 flex-col gap-3 items-center">
        <div className="flex h-7 shrink-0 items-center justify-end px-1" />
        <nav
          className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-0.5 pb-2"
          aria-label={t("settings.title")}
        >
          {SETTINGS_SECTIONS.map((section) => {
            const isActive = activeSection === section.id
            const isDirty = Boolean(dirtyMap[section.id])
            const Icon = section.icon
            const label = t(section.labelKey)
            return (
              <div key={section.id} className="relative">
                <LxIconButton
                  aria-current={isActive ? "page" : undefined}
                  aria-label={label}
                  title={{ content: label, placement: "right" }}
                  highlighted={isActive}
                  onClick={() => navigate(`/settings?section=${section.id}`)}
                >
                  <Icon className="h-3.5 w-3.5" />
                </LxIconButton>
                {isDirty && (
                  <span
                    aria-label="Unsaved changes"
                    className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400"
                  />
                )}
              </div>
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
        aria-label={t("settings.title")}
      >
        {SETTINGS_SECTIONS.map((section) => {
          const isActive = activeSection === section.id
          const isDirty = Boolean(dirtyMap[section.id])
          const Icon = section.icon
          const label = t(section.labelKey)
          return (
            <button
              key={section.id}
              type="button"
              className={`flex h-7 w-full items-center justify-between rounded-[6px] px-2 text-left text-sm transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
                isActive ? "bg-white/5 text-white" : "text-white/70"
              }`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => navigate(`/settings?section=${section.id}`)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </div>
              {isDirty && (
                <span
                  aria-label="Unsaved changes"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                />
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
