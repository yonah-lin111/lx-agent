import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxModal } from "@/components/ui/LxModal"
import { SETTINGS_SECTIONS, useSettingsDraftStore } from "@/features/settings"
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

  const isDirty = useSettingsDraftStore((state) => state.isDirty)
  const reset = useSettingsDraftStore((state) => state.reset)
  const [pendingSectionId, setPendingSectionId] = useState<string | null>(null)

  const handleSectionClick = (targetSectionId: string): void => {
    if (targetSectionId === activeSection) return
    if (isDirty) {
      setPendingSectionId(targetSectionId)
    } else {
      navigate(`/settings?section=${targetSectionId}`)
    }
  }

  const handleConfirmDiscard = (): void => {
    reset()
    const target = pendingSectionId
    setPendingSectionId(null)
    if (target) {
      navigate(`/settings?section=${target}`)
    }
  }

  const discardModal = (
    <LxModal
      isOpen={pendingSectionId !== null}
      onClose={() => setPendingSectionId(null)}
      title={t("settings.unsavedChangesTitle")}
      width="380px"
    >
      <div className="flex flex-col gap-4 text-xs text-white/80">
        <p className="leading-relaxed text-white/70">{t("settings.unsavedChangesContent")}</p>
        <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-2">
          <button
            type="button"
            onClick={() => setPendingSectionId(null)}
            className="cursor-pointer rounded-[6px] border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5"
          >
            {t("settings.stayOnPage")}
          </button>
          <button
            type="button"
            onClick={handleConfirmDiscard}
            className="cursor-pointer rounded-[6px] border border-amber-500/30 bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/30"
          >
            {t("settings.discardAndLeave")}
          </button>
        </div>
      </div>
    </LxModal>
  )

  if (isCollapsed) {
    return (
      <div className="flex h-full min-w-0 flex-col items-center gap-3">
        <div className="flex h-7 shrink-0 items-center justify-end px-1" />
        <nav
          className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-0.5 pb-2"
          aria-label={t("settings.title")}
        >
          {SETTINGS_SECTIONS.map((section) => {
            const isActive = activeSection === section.id
            const Icon = section.icon
            const label = t(section.labelKey)
            return (
              <LxIconButton
                key={section.id}
                aria-current={isActive ? "page" : undefined}
                aria-label={label}
                title={{ content: label, placement: "right" }}
                highlighted={isActive}
                onClick={() => handleSectionClick(section.id)}
              >
                <Icon className="h-3.5 w-3.5" />
              </LxIconButton>
            )
          })}
        </nav>
        {discardModal}
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
          const Icon = section.icon
          const label = t(section.labelKey)
          return (
            <button
              key={section.id}
              type="button"
              className={`settings-sidebar-nav-item flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-sm transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
                isActive ? "active bg-white/5 text-white" : "text-white/70"
              }`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => handleSectionClick(section.id)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </nav>
      {discardModal}
    </div>
  )
}
