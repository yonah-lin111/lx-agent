import type {
  AutoConfigurableMode,
  CollaborationMode,
  PermissionSettings as PermissionSettingsConfig,
} from "@shared/contracts/agent"
import { AUTO_CONFIGURABLE_MODES, COLLABORATION_MODE_ORDER } from "@shared/contracts/agent"
import type React from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { LxTag } from "@/components/ui/LxTag"
import { useTranslation } from "@/i18n"
import { COLLABORATION_MODE_META } from "@/lib/collaborationModes"
import { CollaborationModePermissions } from "./CollaborationModePermissions"

export interface CollaborationModeSettingsProps {
  settings: PermissionSettingsConfig
  setSettings: (settings: PermissionSettingsConfig) => void
}

/**
 * 设置页"协作模式"分区：默认协作模式选择（新会话启动值）+ Auto 模式可用目标模式配置 + 六模式能力权限。
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

  const autoEnabledModes: AutoConfigurableMode[] = settings.autoEnabledModes ?? [
    ...AUTO_CONFIGURABLE_MODES,
  ]

  const toggleAutoMode = (mode: AutoConfigurableMode, enabled: boolean): void => {
    const next = enabled
      ? [...new Set([...autoEnabledModes, mode])]
      : autoEnabledModes.filter((m) => m !== mode)
    setSettings({ ...settings, autoEnabledModes: next })
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

      {/* Auto 模式可用目标模式 */}
      <div className="settings-item-card flex flex-col gap-2.5 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-white/90">
            {t("settings.autoModeAvailableModes")}
          </h3>
          <LxInfoTooltip markdown={t("settings.autoModeAvailableModesDoc")} placement="right" />
        </div>
        <p className="text-xs text-white/45">{t("settings.autoModeAvailableModesDesc")}</p>
        <div className="flex flex-col gap-2 pt-1">
          {/* Build 模式（内置不可取消） */}
          <div className="flex items-center justify-between rounded-[4px] border border-white/6 bg-white/[0.01] px-2.5 py-2">
            <div className="flex items-center gap-2">
              <LxTag size="small" color={COLLABORATION_MODE_META.build.color}>
                {t(COLLABORATION_MODE_META.build.labelKey)}
              </LxTag>
              <span className="text-xs text-white/60">
                {t(COLLABORATION_MODE_META.build.descKey)}
              </span>
            </div>
            <span className="font-mono text-xs text-white/35">
              {t("settings.autoModeBuildFixed")}
            </span>
          </div>

          {/* 可配置模式列表 */}
          {AUTO_CONFIGURABLE_MODES.map((mode) => {
            const meta = COLLABORATION_MODE_META[mode]
            const isChecked = autoEnabledModes.includes(mode)
            return (
              <label
                key={mode}
                className="flex cursor-pointer items-center justify-between rounded-[4px] border border-white/6 bg-white/[0.01] px-2.5 py-2 hover:bg-white/[0.03]"
              >
                <div className="flex items-center gap-2">
                  <LxTag size="small" color={meta.color}>
                    {t(meta.labelKey)}
                  </LxTag>
                  <span className="text-xs text-white/60">{t(meta.descKey)}</span>
                </div>
                <LxCheckbox
                  checked={isChecked}
                  onChange={(checked) => toggleAutoMode(mode, checked)}
                />
              </label>
            )
          })}
        </div>
      </div>

      {/* 协作模式权限 */}
      <CollaborationModePermissions settings={settings} setSettings={setSettings} />
    </div>
  )
}
