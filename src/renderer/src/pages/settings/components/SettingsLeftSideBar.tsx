import { ChevronDown } from "lucide-react"
import { Fragment, useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LxModal } from "@/components/ui/LxModal"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { SETTINGS_NAV_GROUPS, SETTINGS_SECTIONS, useSettingsDraftStore } from "@/features/settings"
import { useTranslation } from "@/i18n"

export interface SettingsLeftSideBarProps {
  isCollapsed?: boolean
}

/**
 * 渲染设置页面专属左侧栏内容，分区按分组折叠展示。
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
  // 分组展开状态，仅保留在内存中（默认全部展开）。
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SETTINGS_NAV_GROUPS.map((group) => [group.id, true])),
  )

  const activeGroupId = SETTINGS_NAV_GROUPS.find((group) =>
    group.sections.some((section) => section.id === activeSection),
  )?.id

  // 切换分区（深链或外部跳转）时展开其所在分组，避免高亮项被折叠隐藏。
  useEffect(() => {
    if (!activeGroupId) return
    setExpandedGroupIds((current) =>
      current[activeGroupId] ? current : { ...current, [activeGroupId]: true },
    )
  }, [activeGroupId])

  /**
   * 切换分组展开状态。
   */
  const toggleGroup = (groupId: string): void => {
    setExpandedGroupIds((current) => ({ ...current, [groupId]: !current[groupId] }))
  }

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
          {SETTINGS_NAV_GROUPS.map((group, index) => (
            <Fragment key={group.id}>
              {index > 0 ? (
                <div
                  data-group-divider="true"
                  className="mx-1 my-1 h-px bg-[var(--color-theme-border,rgba(255,255,255,0.1))]"
                />
              ) : null}
              {group.sections.map((section) => {
                const isActive = activeSection === section.id
                const Icon = section.icon
                const label = t(section.labelKey)
                return (
                  <LxTooltip key={section.id} content={label} placement="right">
                    <LxNavItem
                      level={3}
                      aria-current={isActive ? "page" : undefined}
                      aria-label={label}
                      className={`w-full justify-center ${
                        isActive ? "bg-white/5 text-white" : "text-white/70"
                      }`}
                      onClick={() => handleSectionClick(section.id)}
                      prefix={<Icon className="h-3.5 w-3.5 shrink-0" />}
                    />
                  </LxTooltip>
                )
              })}
            </Fragment>
          ))}
        </nav>
        {discardModal}
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-3">
      <div className="flex h-7 shrink-0 items-center justify-end px-1" />
      <nav
        className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-2"
        aria-label={t("settings.title")}
      >
        {SETTINGS_NAV_GROUPS.map((group) => {
          const isGroupExpanded = expandedGroupIds[group.id] ?? true
          const groupHasActive = activeGroupId === group.id
          const GroupIcon = group.icon
          return (
            <div key={group.id} className="space-y-0.5">
              <LxNavItem
                level={1}
                aria-expanded={isGroupExpanded}
                className={`font-semibold ${groupHasActive ? "text-white" : "text-white/45"}`}
                onClick={() => toggleGroup(group.id)}
                prefix={<GroupIcon className="h-3.5 w-3.5 shrink-0" />}
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
              {isGroupExpanded
                ? group.sections.map((section) => {
                    const isActive = activeSection === section.id
                    const Icon = section.icon
                    const label = t(section.labelKey)
                    return (
                      <LxNavItem
                        key={section.id}
                        level={3}
                        depth={1}
                        aria-current={isActive ? "page" : undefined}
                        className={isActive ? "bg-white/5 text-white" : "text-white/70"}
                        onClick={() => handleSectionClick(section.id)}
                        prefix={<Icon className="h-3.5 w-3.5 shrink-0" />}
                      >
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                      </LxNavItem>
                    )
                  })
                : null}
            </div>
          )
        })}
      </nav>
      {discardModal}
    </div>
  )
}
