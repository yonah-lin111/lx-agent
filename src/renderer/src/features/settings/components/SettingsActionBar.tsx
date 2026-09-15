import { RotateCcw, Save } from "lucide-react"
import { LxIconButton } from "@/components/ui/LxIconButton"
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
        <LxIconButton
          disabled={!isDirty || isSaving}
          textClass="text-white/70"
          className="px-2.5"
          icon={<RotateCcw className="h-3.5 w-3.5" />}
        >
          <span>{t("common.reset")}</span>
        </LxIconButton>
      </LxTooltip>

      {/* 保存按钮 */}
      <LxIconButton
        disabled={!isDirty || isSaving}
        textClass="text-white"
        className="px-3 font-medium"
        icon={<Save className="h-3.5 w-3.5" />}
        onClick={() => void handleSave()}
      >
        <span>{isSaving ? t("common.saving") : t("common.save")}</span>
      </LxIconButton>

      {/* 状态小圆点（调整到保存按钮左侧） */}
      <SettingsStatusPill />
    </div>
  )
}
