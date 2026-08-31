import { AlertCircle, RotateCcw, Save } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import {
  CustomCommandSettings,
  GeneralSettings,
  ModelProviderSettings,
  ModelSettings,
  notifySettingsChanged,
  PermissionSettings,
  SETTINGS_SECTIONS,
  settingsApi,
  settingsDirtyStore,
  usePermissionSettings,
  useSettingsData,
  useSettingsMutations,
} from "@/features/settings"
import { type TranslationKey, useTranslation } from "@/i18n"

const SECTION_DESCRIPTION_KEYS: Record<string, TranslationKey> = {
  general: "settings.generalDesc",
  models: "settings.modelsDesc",
  providers: "settings.providersDesc",
  permissions: "settings.permissionsDesc",
  "custom-commands": "settings.customCommandsDesc",
}

/**
 * 渲染设置页面。
 */
export const SettingsPage = (): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const activeSection = searchParams.get("section") ?? SETTINGS_SECTIONS[0].id
  const { settings, setSettings, isLoading, error, setError } = useSettingsData()
  const { isSaving, saveSettings } = useSettingsMutations()
  const { permissionSettings, setPermissionSettings, permissionError } = usePermissionSettings()
  const [lastSavedSettings, setLastSavedSettings] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const addProviderRef = useRef<(() => void) | null>(null)
  const toast = useLxToast()
  const { t } = useTranslation()

  useEffect(() => {
    if (settings && permissionSettings && lastSavedSettings === null) {
      setLastSavedSettings(JSON.stringify({ models: settings, permissions: permissionSettings }))
    }
  }, [settings, permissionSettings, lastSavedSettings])

  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setDirtyMap(settingsDirtyStore.getDirtyState())
    return settingsDirtyStore.subscribe(() => {
      setDirtyMap({ ...settingsDirtyStore.getDirtyState() })
    })
  }, [])

  const isModelsOrPermsDirty = useMemo(() => {
    if (!settings || !permissionSettings || lastSavedSettings === null) return false
    return (
      JSON.stringify({ models: settings, permissions: permissionSettings }) !== lastSavedSettings
    )
  }, [settings, permissionSettings, lastSavedSettings])

  useEffect(() => {
    settingsDirtyStore.setSectionDirty("models", isModelsOrPermsDirty)
    settingsDirtyStore.setSectionDirty("providers", isModelsOrPermsDirty)
    settingsDirtyStore.setSectionDirty("permissions", isModelsOrPermsDirty)
  }, [isModelsOrPermsDirty])

  const handleReset = (): void => {
    // 1. 恢复 models / permissions 数据到 lastSavedSettings 快照
    if (lastSavedSettings) {
      try {
        const parsed = JSON.parse(lastSavedSettings) as {
          models: typeof settings
          permissions: typeof permissionSettings
        }
        if (parsed.models) setSettings(JSON.parse(JSON.stringify(parsed.models)))
        if (parsed.permissions)
          setPermissionSettings(JSON.parse(JSON.stringify(parsed.permissions)))
      } catch {
        // ignore
      }
    }
    // 2. 触发各分区注册的 reset 回调（例如 custom-commands 清空 draft）
    settingsDirtyStore.resetAllSections()
    settingsDirtyStore.setSectionDirty("custom-commands", false)
    setResetKey((k) => k + 1)
    setError("")
    toast.success(t("settings.resetSuccess"))
  }

  const isCurrentSectionDirty = useMemo(() => {
    if (activeSection === "custom-commands") {
      return Boolean(dirtyMap["custom-commands"])
    }
    return isModelsOrPermsDirty
  }, [activeSection, dirtyMap, isModelsOrPermsDirty])

  const hasAnyDirty = useMemo(() => {
    return isModelsOrPermsDirty || Object.values(dirtyMap).some(Boolean)
  }, [isModelsOrPermsDirty, dirtyMap])

  const isSaved = !isCurrentSectionDirty

  const save = async (): Promise<void> => {
    setError("")
    try {
      if (activeSection === "custom-commands") {
        await settingsDirtyStore.saveSection("custom-commands")
        toast.success(t("settings.saveSuccess"))
        return
      }

      if (!settings || !permissionSettings) return
      const saved = await saveSettings(settings)
      const savedPermission = await settingsApi.savePermissionSettings(permissionSettings)
      setSettings(saved)
      setPermissionSettings(savedPermission)
      setLastSavedSettings(JSON.stringify({ models: saved, permissions: savedPermission }))
      notifySettingsChanged("models")
      notifySettingsChanged("permissions")
      toast.success(t("settings.saveSuccess"))
    } catch (saveError) {
      const errorMessage = saveError instanceof Error ? saveError.message : t("settings.saveFailed")
      setError(errorMessage)
      toast.error(errorMessage)
    }
  }

  const descKey = SECTION_DESCRIPTION_KEYS[activeSection]
  const currentDescription = descKey ? t(descKey) : ""

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 p-3">
        <p className="text-xs text-white/45">{currentDescription}</p>
        <div className="flex items-center gap-1">
          {activeSection === "providers" ? (
            <LxIconButton
              preset="add"
              aria-label={t("settings.addProvider")}
              title={{ content: t("settings.addProvider"), placement: "bottom" }}
              onClick={() => addProviderRef.current?.()}
            />
          ) : null}
          <LxIconButton
            aria-label={t("settings.resetSettings")}
            title={{
              title: t("settings.confirmResetTitle"),
              content: t("settings.confirmResetContent"),
              placement: "bottom",
              onConfirm: handleReset,
            }}
            disabled={!hasAnyDirty}
          >
            <RotateCcw className="h-4 w-4" />
          </LxIconButton>
          <LxIconButton
            preset="save"
            aria-label={t("settings.saveSettings")}
            title={{
              title: t("settings.confirmSaveTitle"),
              content: t("settings.confirmSaveContent"),
              placement: "bottom",
              onConfirm: () => void save(),
            }}
            disabled={isSaving || isSaved}
          >
            <Save className="h-4 w-4" />
          </LxIconButton>
          <LxTooltip content={isSaved ? t("common.saved") : t("common.unsaved")} placement="bottom">
            <span
              aria-label={isSaved ? t("common.saved") : t("common.unsaved")}
              className={`ml-1.5 h-2 w-2 shrink-0 rounded-full ${
                isSaved ? "bg-emerald-400" : "bg-amber-400"
              }`}
              role="status"
            />
          </LxTooltip>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-full items-center justify-center text-sm text-white/45">
          {t("settings.loadingSettings")}
        </div>
      ) : !settings ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-rose-300">
          <AlertCircle className="h-5 w-5" />
          <span>{error || t("settings.loadSettingsFailed")}</span>
        </div>
      ) : (
        <div key={resetKey} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {error ? <p className="px-3 pt-2 text-xs text-rose-300">{error}</p> : null}
          {permissionError ? (
            <p className="px-3 pt-2 text-xs text-rose-300">{permissionError}</p>
          ) : null}
          {activeSection === "general" ? <GeneralSettings /> : null}
          {activeSection === "models" ? (
            <ModelSettings settings={settings} setSettings={setSettings} />
          ) : null}
          {activeSection === "providers" ? (
            <ModelProviderSettings
              settings={settings}
              setSettings={setSettings}
              onRegisterAddProvider={(fn) => {
                addProviderRef.current = fn
              }}
              onAddProvider={() => toast.success(t("settings.addProviderSuccess"))}
              onDeleteProvider={() => toast.success(t("settings.deleteProviderSuccess"))}
            />
          ) : null}
          {activeSection === "permissions" && permissionSettings ? (
            <PermissionSettings settings={permissionSettings} setSettings={setPermissionSettings} />
          ) : null}
          {activeSection === "custom-commands" ? <CustomCommandSettings /> : null}
        </div>
      )}
    </section>
  )
}
