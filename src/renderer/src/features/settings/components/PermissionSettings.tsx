import type {
  PermissionMode,
  PermissionSettings as PermissionSettingsConfig,
} from "@shared/contracts/agent"
import { AlertCircle, Plus } from "lucide-react"
import type React from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { type TranslationKey, useTranslation } from "@/i18n"

// 规则组配置（按优先级展示）。
const RULE_GROUPS: Array<{
  key: "allow" | "deny" | "ask"
  labelKey: TranslationKey
  descKey: TranslationKey
}> = [
  { key: "deny", labelKey: "settings.denyRules", descKey: "settings.denyRulesDesc" },
  { key: "ask", labelKey: "settings.askRules", descKey: "settings.askRulesDesc" },
  { key: "allow", labelKey: "settings.allowRules", descKey: "settings.allowRulesDesc" },
]

// 校验规则语法：ToolName(arg) 或 ToolName / ToolName()。
const isValidRule = (value: string): boolean => /^[A-Za-z0-9_-]+(?:\(.*\))?$/.test(value.trim())

export interface PermissionSettingsProps {
  settings: PermissionSettingsConfig
  setSettings: (settings: PermissionSettingsConfig) => void
}

/**
 * 设置页"权限"分区：模式三选一 + allow/deny/ask 三组规则编辑器。
 * 仅维护编辑态，保存由设置页统一处理（写入 agent.permissions）。
 */
export const PermissionSettings = ({
  settings,
  setSettings,
}: PermissionSettingsProps): React.JSX.Element => {
  const { t } = useTranslation()

  const modeOptions: LxSelectOption<PermissionMode>[] = [
    { value: "default", label: t("settings.modeDefault") },
    { value: "acceptEdits", label: t("settings.modeAcceptEdits") },
    { value: "bypassPermissions", label: t("settings.modeBypass") },
  ]

  const modeDescriptions: Record<PermissionMode, string> = {
    default: t("settings.modeDefaultDesc"),
    acceptEdits: t("settings.modeAcceptEditsDesc"),
    bypassPermissions: t("settings.modeBypassDesc"),
  }

  const updateMode = (defaultMode: PermissionMode): void => {
    setSettings({ ...settings, defaultMode })
  }

  const updateRules = (key: "allow" | "deny" | "ask", rules: string[]): void => {
    setSettings({ ...settings, [key]: rules })
  }

  const addRule = (key: "allow" | "deny" | "ask"): void => {
    updateRules(key, [...settings[key], ""])
  }

  const removeRule = (key: "allow" | "deny" | "ask", index: number): void => {
    updateRules(
      key,
      settings[key].filter((_, ruleIndex) => ruleIndex !== index),
    )
  }

  const updateRule = (key: "allow" | "deny" | "ask", index: number, value: string): void => {
    updateRules(
      key,
      settings[key].map((rule, ruleIndex) => (ruleIndex === index ? value : rule)),
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      {/* 模式选择 */}
      <div className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
        <h3 className="text-sm font-semibold text-white/90">{t("settings.permissionMode")}</h3>
        <p className="text-xs text-white/45">{t("settings.permissionModeDesc")}</p>
        <div className="w-72">
          <LxSelect value={settings.defaultMode} onChange={updateMode} options={modeOptions} />
        </div>
        <p className="text-xs text-white/45">{modeDescriptions[settings.defaultMode]}</p>
        {settings.defaultMode === "bypassPermissions" ? (
          <p className="flex items-center gap-1 text-xs text-amber-300/80">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {t("settings.bypassWarning")}
          </p>
        ) : null}
      </div>

      {/* 规则组 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {RULE_GROUPS.map((group) => {
          const groupLabel = t(group.labelKey)
          const groupDesc = t(group.descKey)
          return (
            <div
              key={group.key}
              className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <h4 className="text-sm font-semibold text-white/90">{groupLabel}</h4>
                  <p className="text-xs text-white/45">{groupDesc}</p>
                </div>
                <LxIconButton
                  preset="add"
                  aria-label={t("settings.addRuleFor", { label: groupLabel })}
                  title={{ content: t("settings.addRule"), placement: "left" }}
                  onClick={() => addRule(group.key)}
                />
              </div>
              {settings[group.key].length === 0 ? (
                <p className="text-xs text-white/25">{t("settings.noRules")}</p>
              ) : (
                settings[group.key].map((rule, index) => {
                  const invalid = !isValidRule(rule)
                  return (
                    <div key={index} className="flex items-center gap-1.5">
                      <LxInput
                        value={rule}
                        placeholder={t("settings.rulePlaceholder")}
                        className={invalid ? "border-rose-400/50" : ""}
                        aria-invalid={invalid}
                        onChange={(event) => updateRule(group.key, index, event.target.value)}
                      />
                      {invalid ? (
                        <LxTooltip content={t("settings.ruleInvalidFormat")} placement="top">
                          <AlertCircle className="h-4 w-4 shrink-0 text-rose-300" />
                        </LxTooltip>
                      ) : null}
                      <LxIconButton
                        preset="delete"
                        aria-label={t("settings.deleteRule", { rule })}
                        title={{ content: t("common.delete"), placement: "left" }}
                        onClick={() => removeRule(group.key, index)}
                      />
                    </div>
                  )
                })
              )}
            </div>
          )
        })}
      </div>

      <p className="flex items-center gap-1 text-xs text-white/35">
        <Plus className="h-3 w-3" />
        {t("settings.ruleSyntaxHint")}
      </p>
    </div>
  )
}
