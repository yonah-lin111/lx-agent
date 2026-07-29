import { AlertCircle, Save } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import {
  ModelProviderSettings,
  ModelSettings,
  SETTINGS_SECTIONS,
  useSettingsData,
  useSettingsMutations,
} from "@/features/settings"

const SECTION_DESCRIPTIONS: Record<string, string> = {
  models: "选择各类任务默认使用的模型",
  providers: "配置与管理模型 Provider 及模型参数",
}

/**
 * 渲染设置页面。
 */
export const SettingsPage = (): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const activeSection = searchParams.get("section") ?? SETTINGS_SECTIONS[0].id
  const { settings, setSettings, isLoading, error, setError } = useSettingsData()
  const { isSaving, saveSettings } = useSettingsMutations()
  const [lastSavedSettings, setLastSavedSettings] = useState<string | null>(null)
  const addProviderRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (settings && lastSavedSettings === null) {
      setLastSavedSettings(JSON.stringify(settings))
    }
  }, [settings, lastSavedSettings])

  const isSaved = useMemo(() => {
    if (!settings || lastSavedSettings === null) return true
    return JSON.stringify(settings) === lastSavedSettings
  }, [settings, lastSavedSettings])

  const save = async (): Promise<void> => {
    if (!settings) return
    setError("")
    try {
      const saved = await saveSettings(settings)
      setSettings(saved)
      setLastSavedSettings(JSON.stringify(saved))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存配置失败")
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
            title={{ content: "保存配置", placement: "bottom" }}
            disabled={isSaving}
            onClick={() => void save()}
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
            />
          ) : null}
        </div>
      )}
    </section>
  )
}
