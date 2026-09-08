import type React from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useSettingsDraftStore } from "@/features/settings/hooks/settingsDraftStore"
import { useTranslation } from "@/i18n"

// 状态小圆点属性。
export interface SettingsStatusPillProps {
  className?: string
}

/**
 * 渲染设置页面当前分区的持久化状态指示小圆点。
 */
export const SettingsStatusPill = ({
  className = "",
}: SettingsStatusPillProps): React.JSX.Element => {
  const { t } = useTranslation()
  const isDirty = useSettingsDraftStore((state) => state.isDirty)
  const isSaving = useSettingsDraftStore((state) => state.isSaving)
  const error = useSettingsDraftStore((state) => state.error)

  const { dotColor, tooltipText } = (() => {
    if (isSaving) {
      return {
        dotColor: "bg-sky-400 animate-pulse",
        tooltipText: t("settings.savingStatus"),
      }
    }
    if (error) {
      return {
        dotColor: "bg-red-400",
        tooltipText: error || t("settings.saveFailedStatus"),
      }
    }
    if (isDirty) {
      return {
        dotColor: "bg-amber-400",
        tooltipText: t("settings.unsavedStatus"),
      }
    }
    return {
      dotColor: "bg-emerald-400",
      tooltipText: t("settings.savedStatus"),
    }
  })()

  return (
    <LxTooltip placement="bottom" content={tooltipText}>
      <span
        aria-label={tooltipText}
        className={`inline-flex shrink-0 cursor-default items-center justify-center p-1 ${className}`.trim()}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
      </span>
    </LxTooltip>
  )
}
