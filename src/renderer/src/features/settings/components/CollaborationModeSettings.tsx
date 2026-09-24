import type {
  CollaborationMode,
  PermissionSettings as PermissionSettingsConfig,
} from "@shared/contracts/agent"
import { COLLABORATION_MODE_ORDER } from "@shared/contracts/agent"
import type React from "react"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { useTranslation } from "@/i18n"
import { COLLABORATION_MODE_META } from "@/lib/collaborationModes"
import { CollaborationModePermissions } from "./CollaborationModePermissions"

export interface CollaborationModeSettingsProps {
  settings: PermissionSettingsConfig
  setSettings: (settings: PermissionSettingsConfig) => void
}

/**
 * 设置页"协作模式"分区：默认协作模式选择（新会话启动值）+ 五模式能力权限。
 * 与"权限"分区共用同一份 agent.permissions 草稿与保存流程。
 */
export const CollaborationModeSettings = ({
  settings,
  setSettings,
}: CollaborationModeSettingsProps): React.JSX.Element => {
  const { t } = useTranslation()

  // 默认协作模式（新会话启动值；缺省 build）。
  const currentCollaborationMode: CollaborationMode = settings.collaborationMode ?? "build"
  const collaborationModeOptions: LxSelectOption<CollaborationMode>[] =
    COLLABORATION_MODE_ORDER.map((mode) => ({
      value: mode,
      label: t(COLLABORATION_MODE_META[mode].labelKey),
    }))

  const updateCollaborationMode = (collaborationMode: CollaborationMode): void => {
    setSettings({ ...settings, collaborationMode })
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      {/* 默认协作模式 */}
      <div className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-white/90">
            {t("settings.defaultCollaborationMode")}
          </h3>
          <LxInfoTooltip markdown={t("settings.defaultCollaborationModeDoc")} placement="right" />
        </div>
        <p className="text-xs text-white/45">{t("settings.defaultCollaborationModeDesc")}</p>
        <div className="w-80">
          <LxSelect
            value={currentCollaborationMode}
            onChange={updateCollaborationMode}
            options={collaborationModeOptions}
          />
        </div>
        <p className="text-xs text-white/45">
          {t(COLLABORATION_MODE_META[currentCollaborationMode].descKey)}
        </p>
      </div>

      {/* 协作模式权限 */}
      <CollaborationModePermissions settings={settings} setSettings={setSettings} />
    </div>
  )
}
