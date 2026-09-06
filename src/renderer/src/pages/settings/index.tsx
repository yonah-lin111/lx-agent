import { AlertCircle } from "lucide-react"
import { useCallback, useEffect, useRef } from "react"
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
  PermissionSettings,
  SETTINGS_SECTIONS,
  SkillSettings,
  settingsApi,
  usePermissionSettings,
  useSettingsData,
  useSettingsMutations,
  VoiceSettingsComponent,
} from "@/features/settings"
import { type TranslationKey, useTranslation } from "@/i18n"

const SECTION_DESCRIPTION_KEYS: Record<string, TranslationKey> = {
  general: "settings.generalDesc",
  cli: "settings.cliDesc",
  lsp: "settings.lspDesc",
  mcp: "settings.mcpDesc",
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

  // 记录磁盘已持久化快照，防止初始化加载时产生空写
  const lastSavedSettingsRef = useRef<string | null>(null)
  const lastSavedPermissionsRef = useRef<string | null>(null)

  useEffect(() => {
    if (settings && lastSavedSettingsRef.current === null) {
      lastSavedSettingsRef.current = JSON.stringify(settings)
    }
  }, [settings])

  useEffect(() => {
    if (permissionSettings && lastSavedPermissionsRef.current === null) {
      lastSavedPermissionsRef.current = JSON.stringify(permissionSettings)
    }
  }, [permissionSettings])

  // settings (models / providers) 防抖自动持久化
  const settingsTimerRef = useRef<NodeJS.Timeout | null>(null)
  const currentSettingsRef = useRef(settings)
  currentSettingsRef.current = settings

  const flushSettingsSave = useCallback(async () => {
    if (settingsTimerRef.current) {
      clearTimeout(settingsTimerRef.current)
      settingsTimerRef.current = null
    }
    const current = currentSettingsRef.current
    if (!current || lastSavedSettingsRef.current === null) return
    const json = JSON.stringify(current)
    if (json === lastSavedSettingsRef.current) return

    try {
      const saved = await saveSettings(current)
      lastSavedSettingsRef.current = JSON.stringify(saved)
      notifySettingsChanged("models")
    } catch (saveError) {
      const errorMessage = saveError instanceof Error ? saveError.message : t("settings.saveFailed")
      setError(errorMessage)
    }
  }, [saveSettings, setError, t])

  useEffect(() => {
    if (!settings || lastSavedSettingsRef.current === null) return
    const json = JSON.stringify(settings)
    if (json === lastSavedSettingsRef.current) return

    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current)
    settingsTimerRef.current = setTimeout(() => {
      void flushSettingsSave()
    }, 800)

    return () => {
      if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current)
    }
  }, [settings, flushSettingsSave])

  // permissionSettings 防抖自动持久化
  const permissionsTimerRef = useRef<NodeJS.Timeout | null>(null)
  const currentPermissionsRef = useRef(permissionSettings)
  currentPermissionsRef.current = permissionSettings

  const flushPermissionsSave = useCallback(async () => {
    if (permissionsTimerRef.current) {
      clearTimeout(permissionsTimerRef.current)
      permissionsTimerRef.current = null
    }
    const current = currentPermissionsRef.current
    if (!current || lastSavedPermissionsRef.current === null) return
    const json = JSON.stringify(current)
    if (json === lastSavedPermissionsRef.current) return

    try {
      const saved = await settingsApi.savePermissionSettings(current)
      lastSavedPermissionsRef.current = JSON.stringify(saved)
      notifySettingsChanged("permissions")
    } catch (saveError) {
      const errorMessage = saveError instanceof Error ? saveError.message : t("settings.saveFailed")
      setError(errorMessage)
    }
  }, [setError, t])

  useEffect(() => {
    if (!permissionSettings || lastSavedPermissionsRef.current === null) return
    const json = JSON.stringify(permissionSettings)
    if (json === lastSavedPermissionsRef.current) return

    if (permissionsTimerRef.current) clearTimeout(permissionsTimerRef.current)
    permissionsTimerRef.current = setTimeout(() => {
      void flushPermissionsSave()
    }, 800)

    return () => {
      if (permissionsTimerRef.current) clearTimeout(permissionsTimerRef.current)
    }
  }, [permissionSettings, flushPermissionsSave])

  // 切换 Tab 或卸载时立即持久化未写入的更改
  useEffect(() => {
    return () => {
      void flushSettingsSave()
      void flushPermissionsSave()
    }
  }, [activeSection, flushSettingsSave, flushPermissionsSave])

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
