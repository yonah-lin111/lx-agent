import { AlertCircle, Save } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import {
  ModelProviderSettings,
  ModelSettings,
  PermissionSettings,
  SETTINGS_SECTIONS,
  settingsApi,
  usePermissionSettings,
  useSettingsData,
  useSettingsMutations,
} from "@/features/settings"

const SECTION_DESCRIPTIONS: Record<string, string> = {
  models: "选择各类任务默认使用的模型",
  providers: "配置与管理模型 Provider 及模型参数",
  permissions: "配置 Agent 工具执行权限与确认模式",
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
  const addProviderRef = useRef<(() => void) | null>(null)
  const toast = useLxToast()

  useEffect(() => {
    if (settings && permissionSettings && lastSavedSettings === null) {
      setLastSavedSettings(JSON.stringify({ models: settings, permissions: permissionSettings }))
    }
  }, [settings, permissionSettings, lastSavedSettings])

  const isSaved = useMemo(() => {
    if (!settings || !permissionSettings || lastSavedSettings === null) return true
    return (
      JSON.stringify({ models: settings, permissions: permissionSettings }) === lastSavedSettings
    )
  }, [settings, permissionSettings, lastSavedSettings])

  const save = async (): Promise<void> => {
    if (!settings || !permissionSettings) return
    setError("")
    try {
      const saved = await saveSettings(settings)
      const savedPermission = await settingsApi.savePermissionSettings(permissionSettings)
      setSettings(saved)
      setPermissionSettings(savedPermission)
      setLastSavedSettings(JSON.stringify({ models: saved, permissions: savedPermission }))
      toast.success("保存配置成功")
      window.location.reload()
    } catch (saveError) {
      const errorMessage = saveError instanceof Error ? saveError.message : "保存配置失败"
      setError(errorMessage)
      toast.error(errorMessage)
    }
  }

  const currentDescription = SECTION_DESCRIPTIONS[activeSection] ?? ""

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 p-3">
        <p className="text-xs text-white/45">{currentDescription}</p>
        <div className="flex items-center gap-1">
          {activeSection === "providers" ? (
            <LxIconButton
              preset="add"
              aria-label="添加 Provider"
              title={{ content: "添加 Provider", placement: "bottom" }}
              onClick={() => addProviderRef.current?.()}
            />
          ) : null}
          <LxIconButton
            preset="save"
            aria-label="保存配置"
            title={{
              title: "确认保存配置？",
              content: "保存后将刷新页面",
              placement: "bottom",
              onConfirm: () => void save(),
            }}
            disabled={isSaving || isSaved}
          >
            <Save className="h-4 w-4" />
          </LxIconButton>
          <LxTooltip content={isSaved ? "已保存" : "未保存"} placement="bottom">
            <span
              aria-label={isSaved ? "已保存" : "未保存"}
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
          正在读取配置...
        </div>
      ) : !settings ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-rose-300">
          <AlertCircle className="h-5 w-5" />
          <span>{error || "无法读取配置"}</span>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {error ? <p className="px-3 pt-2 text-xs text-rose-300">{error}</p> : null}
          {permissionError ? (
            <p className="px-3 pt-2 text-xs text-rose-300">{permissionError}</p>
          ) : null}
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
              onAddProvider={() => toast.success("添加 Provider 成功")}
              onDeleteProvider={() => toast.success("删除 Provider 成功")}
            />
          ) : null}
          {activeSection === "permissions" && permissionSettings ? (
            <PermissionSettings settings={permissionSettings} setSettings={setPermissionSettings} />
          ) : null}
        </div>
      )}
    </section>
  )
}
