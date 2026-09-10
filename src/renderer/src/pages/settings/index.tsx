import { AlertCircle } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxToast } from "@/components/ui/LxToast"
import {
  CliSettings,
  CustomCommandSettings,
  GeneralSettings,
  LspSettings,
  McpSettings,
  ModelProviderSettings,
  ModelSettings,
  notifySettingsChanged,
  OpenClawSettings,
  PermissionSettings,
  SETTINGS_SECTIONS,
  SettingsActionBar,
  SkillSettings,
  settingsApi,
  usePermissionSettings,
  useRegisterSettingsSection,
  useSettingsData,
  useSettingsDraftStore,
  useSettingsMutations,
  VoiceSettingsComponent,
} from "@/features/settings"
import { type TranslationKey, useTranslation } from "@/i18n"

const SECTION_DESCRIPTION_KEYS: Record<string, TranslationKey> = {
  general: "settings.generalDesc",
  cli: "settings.cliDesc",
  lsp: "settings.lspDesc",
  mcp: "settings.mcpDesc",
  openclaw: "settings.openclawDesc",
  skills: "settings.skillsDesc",
  models: "settings.modelsDesc",
  providers: "settings.providersDesc",
  voice: "settings.voiceDesc",
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
  const { saveSettings } = useSettingsMutations()
  const { permissionSettings, setPermissionSettings, permissionError } = usePermissionSettings()
  const addProviderRef = useRef<(() => void) | null>(null)
  const toast = useLxToast()
  const { t } = useTranslation()

  // 同步当前激活分区到草稿协调 Store
  const setActiveSection = useSettingsDraftStore((state) => state.setActiveSection)
  useEffect(() => {
    setActiveSection(activeSection)
  }, [activeSection, setActiveSection])

  // models / providers 基线快照与草稿管理
  const baselineSettingsRef = useRef<string | null>(null)
  useEffect(() => {
    if (settings && baselineSettingsRef.current === null) {
      baselineSettingsRef.current = JSON.stringify(settings)
    }
  }, [settings])

  const isModelsOrProvidersDirty = useMemo(() => {
    if (!settings || baselineSettingsRef.current === null) return false
    return JSON.stringify(settings) !== baselineSettingsRef.current
  }, [settings])

  const saveModelsOrProviders = useCallback(async (): Promise<void> => {
    if (!settings) return
    try {
      const saved = await saveSettings(settings)
      baselineSettingsRef.current = JSON.stringify(saved)
      notifySettingsChanged("models")
    } catch (saveError) {
      const errorMessage = saveError instanceof Error ? saveError.message : t("settings.saveFailed")
      setError(errorMessage)
      throw saveError
    }
  }, [settings, saveSettings, activeSection, setError, t])

  const resetModelsOrProviders = useCallback((): void => {
    if (baselineSettingsRef.current !== null) {
      setSettings(JSON.parse(baselineSettingsRef.current))
    }
  }, [setSettings])

  useRegisterSettingsSection({
    section: "models",
    isDirty: activeSection === "models" && isModelsOrProvidersDirty,
    onSave: saveModelsOrProviders,
    onReset: resetModelsOrProviders,
  })

  useRegisterSettingsSection({
    section: "providers",
    isDirty: activeSection === "providers" && isModelsOrProvidersDirty,
    onSave: saveModelsOrProviders,
    onReset: resetModelsOrProviders,
  })

  // permissions 基线快照与草稿管理
  const baselinePermissionsRef = useRef<string | null>(null)
  useEffect(() => {
    if (permissionSettings && baselinePermissionsRef.current === null) {
      baselinePermissionsRef.current = JSON.stringify(permissionSettings)
    }
  }, [permissionSettings])

  const isPermissionsDirty = useMemo(() => {
    if (!permissionSettings || baselinePermissionsRef.current === null) return false
    return JSON.stringify(permissionSettings) !== baselinePermissionsRef.current
  }, [permissionSettings])

  const savePermissions = useCallback(async (): Promise<void> => {
    if (!permissionSettings) return
    try {
      const saved = await settingsApi.savePermissionSettings(permissionSettings)
      baselinePermissionsRef.current = JSON.stringify(saved)
      notifySettingsChanged("permissions")
    } catch (saveError) {
      const errorMessage = saveError instanceof Error ? saveError.message : t("settings.saveFailed")
      setError(errorMessage)
      throw saveError
    }
  }, [permissionSettings, setError, t])

  const resetPermissions = useCallback((): void => {
    if (baselinePermissionsRef.current !== null) {
      setPermissionSettings(JSON.parse(baselinePermissionsRef.current))
    }
  }, [setPermissionSettings])

  useRegisterSettingsSection({
    section: "permissions",
    isDirty: activeSection === "permissions" && isPermissionsDirty,
    onSave: savePermissions,
    onReset: resetPermissions,
  })

  const descKey = SECTION_DESCRIPTION_KEYS[activeSection]
  const currentDescription = descKey ? t(descKey) : ""

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 p-3">
        <p className="text-xs text-white/45">{currentDescription}</p>
        <div className="flex items-center gap-2">
          {activeSection === "providers" ? (
            <LxIconButton
              preset="add"
              aria-label={t("settings.addProvider")}
              title={{ content: t("settings.addProvider"), placement: "bottom" }}
              onClick={() => addProviderRef.current?.()}
            />
          ) : null}
          <SettingsActionBar />
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {error ? <p className="px-3 pt-2 text-xs text-rose-300">{error}</p> : null}
          {permissionError ? (
            <p className="px-3 pt-2 text-xs text-rose-300">{permissionError}</p>
          ) : null}
          {activeSection === "general" ? <GeneralSettings /> : null}
          {activeSection === "cli" ? <CliSettings /> : null}
          {activeSection === "lsp" ? <LspSettings /> : null}
          {activeSection === "mcp" ? <McpSettings /> : null}
          {activeSection === "openclaw" ? <OpenClawSettings /> : null}
          {activeSection === "skills" ? <SkillSettings /> : null}
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
          {activeSection === "voice" ? <VoiceSettingsComponent /> : null}
          {activeSection === "permissions" && permissionSettings ? (
            <PermissionSettings settings={permissionSettings} setSettings={setPermissionSettings} />
          ) : null}
          {activeSection === "custom-commands" ? <CustomCommandSettings /> : null}
        </div>
      )}
    </section>
  )
}
