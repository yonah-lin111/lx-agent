import { RotateCcw, Save } from "lucide-react"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useSettingsDraftStore } from "@/features/settings/hooks/settingsDraftStore"
import { useTranslation } from "@/i18n"
import { SettingsStatusPill } from "./SettingsStatusPill"

// 设置操作栏组件属性。
export interface SettingsActionBarProps {
  className?: string
}

/**
 * 渲染设置页面右上角的操作工具栏：重置按钮、状态小圆点与保存按钮。
 */
export const SettingsActionBar = ({
  className = "",
}: SettingsActionBarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()
  const isDirty = useSettingsDraftStore((state) => state.isDirty)
  const isSaving = useSettingsDraftStore((state) => state.isSaving)
  const save = useSettingsDraftStore((state) => state.save)
  const reset = useSettingsDraftStore((state) => state.reset)

  const handleSave = async (): Promise<void> => {
    const success = await save()
    if (success) {
      toast.success(t("settings.saveSuccess"))
    } else {
      toast.error(t("settings.saveFailed"))
    }
  }

  const handleConfirmReset = (): void => {
    reset()
    toast.success(t("settings.resetSuccess"))
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`.trim()}>
      {/* 重置按钮：使用 LxTooltip 气泡进行二次确认 */}
      <LxTooltip
        placement="bottom"
        title={!isDirty || isSaving ? undefined : t("settings.confirmResetTitle")}
        content={!isDirty || isSaving ? undefined : t("settings.confirmResetContent")}
        onConfirm={!isDirty || isSaving ? undefined : handleConfirmReset}
      >
        <button
          type="button"
          disabled={!isDirty || isSaving}
          className="flex items-center gap-1 rounded-[6px] border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" />
          <span>{t("common.reset")}</span>
        </button>
      </LxTooltip>

      {/* 保存按钮 */}
      <button
        type="button"
        disabled={!isDirty || isSaving}
        onClick={() => void handleSave()}
        className="flex items-center gap-1 rounded-[6px] border border-white/15 bg-white/[0.08] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Save className="h-3 w-3" />
        <span>{isSaving ? t("common.saving") : t("common.save")}</span>
      </button>

      {/* 状态小圆点（调整到保存按钮左侧） */}
      <SettingsStatusPill />
    </div>
  )
}
