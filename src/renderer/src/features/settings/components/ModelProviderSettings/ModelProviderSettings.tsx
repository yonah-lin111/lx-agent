import { OPENCODE_GO_PROVIDER_ID } from "@shared/opencodeGo"
import { Download, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { useLxToast } from "@/components/ui/LxToast"
import { useTranslation } from "@/i18n"
import { ModelProviderMenu } from "./components/ModelProviderMenu"
import { ProviderBasicFields } from "./components/ProviderBasicFields"
import { ProviderModelRow } from "./components/ProviderModelRow"
import { ProviderNav } from "./components/ProviderNav"
import { useFetchedProviderModels } from "./hooks/useFetchedProviderModels"
import { useModelProviderMutations } from "./hooks/useModelProviderMutations"
import { useOpencodeGoRefresh } from "./hooks/useOpencodeGoRefresh"
import type { ModelProviderSettingsProps, ProviderMenuState } from "./types"
import { isOpencodeGoMissing } from "./utils"

/**
 * 渲染模型 Provider 的读取、编辑和保存界面。
 */
export const ModelProviderSettings = ({
  settings,
  setSettings,
  onRegisterAddProvider,
  onAddProvider,
  onDeleteProvider,
}: ModelProviderSettingsProps): React.JSX.Element => {
  const [selectedProviderId, setSelectedProviderId] = useState<string>("")
  const [expandedModelKeys, setExpandedModelKeys] = useState<Record<string, boolean>>({})
  const [menuState, setMenuState] = useState<ProviderMenuState | null>(null)
  const { t } = useTranslation()
  const toast = useLxToast()

  const {
    updateProvider,
    updateModelPricing,
    toggleProviderEnabled,
    deleteProvider,
    duplicateProvider,
    addModel,
    duplicateModel,
    addOpencodeGoPreset,
  } = useModelProviderMutations({
    setSettings,
    selectedProviderId,
    setSelectedProviderId,
    onRegisterAddProvider,
    onAddProvider,
    onDeleteProvider,
  })

  const {
    fetchedModels,
    isFetchingModels,
    modelListQuery,
    setModelListQuery,
    invalidateFetchedModels,
    applyFetchedModel,
    fetchProviderModels,
  } = useFetchedProviderModels({ settings, updateProvider })

  useEffect(() => {
    if (settings && !selectedProviderId) {
      setSelectedProviderId(Object.keys(settings.providers)[0] ?? "")
    }
  }, [settings, selectedProviderId])

  useEffect(() => {
    if (settings && selectedProviderId && !settings.providers[selectedProviderId]) {
      setSelectedProviderId(Object.keys(settings.providers)[0] ?? "")
    }
  }, [selectedProviderId, settings])

  const selectedProvider = settings.providers[selectedProviderId]
  const isOpencodeGoSelected =
    selectedProviderId === OPENCODE_GO_PROVIDER_ID ||
    selectedProvider?.id === OPENCODE_GO_PROVIDER_ID

  const { isRefreshing, refreshOpencodeGo } = useOpencodeGoRefresh({ setSettings })

  // 一键添加 OpenCode Go 预设（幂等，已存在时入口隐藏，此处为二次兜底）。
  const handleAddOpencodeGo = (): void => {
    if (!isOpencodeGoMissing(settings.providers)) return
    addOpencodeGoPreset()
    toast.success(t("settings.addOpencodeGoSuccess"))
  }

  return (
    <div className="@container flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 p-3">
      {/* 提示信息说明与文档 */}
      <div className="flex items-center justify-between gap-2 rounded-[6px] border border-white/6 bg-white/[0.02] p-3 text-xs text-white/60 leading-relaxed">
        <div className="flex items-center gap-2">
          <span>{t("settings.providersDesc")}</span>
          <LxInfoTooltip markdown={t("settings.providersDoc")} placement="right" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 @[520px]:grid-cols-[180px_minmax(0,1fr)]">
        <ProviderNav
          providers={settings.providers}
          selectedProviderId={selectedProviderId}
          enabledProviders={settings.enabledProviders}
          onSelect={setSelectedProviderId}
          onToggleEnabled={toggleProviderEnabled}
          onOpenContextMenu={(providerKey, providerName, isEnabled, x, y, anchor) =>
            setMenuState({ providerKey, providerName, isEnabled, x, y, anchor })
          }
          onAddOpencodeGo={handleAddOpencodeGo}
        />

        {selectedProvider ? (
          <div className="min-h-0 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <ProviderBasicFields
              providerId={selectedProviderId}
              provider={selectedProvider}
              updateProvider={updateProvider}
              invalidateFetchedModels={invalidateFetchedModels}
            />

            <div className="settings-item-card mt-4 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">{t("settings.modelsList")}</h3>
                <div className="flex items-center gap-1">
                  {isOpencodeGoSelected ? (
                    <LxIconButton
                      aria-label={t("settings.refreshOpencodeGo")}
                      title={{ content: t("settings.refreshOpencodeGo"), placement: "top" }}
                      disabled={isRefreshing || isFetchingModels}
                      onClick={() => void refreshOpencodeGo()}
                    >
                      <RefreshCw />
                    </LxIconButton>
                  ) : null}
                  <LxIconButton
                    aria-label={t("settings.fetchModels")}
                    title={{ content: t("settings.fetchModels"), placement: "top" }}
                    disabled={isFetchingModels}
                    onClick={() => void fetchProviderModels(selectedProviderId)}
                  >
                    <Download />
                  </LxIconButton>
                  <LxIconButton
                    preset="add"
                    aria-label={t("settings.addModel")}
                    title={{ content: t("settings.addModel"), placement: "top" }}
                    onClick={() => addModel(selectedProviderId)}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {Object.entries(selectedProvider.models).map(([modelKey, model]) => (
                  <ProviderModelRow
                    key={modelKey}
                    providerId={selectedProviderId}
                    modelKey={modelKey}
                    model={model}
                    isExpanded={expandedModelKeys[`${selectedProviderId}:${modelKey}`] ?? false}
                    onToggleExpanded={() =>
                      setExpandedModelKeys((current) => ({
                        ...current,
                        [`${selectedProviderId}:${modelKey}`]:
                          !current[`${selectedProviderId}:${modelKey}`],
                      }))
                    }
                    updateProvider={updateProvider}
                    updateModelPricing={updateModelPricing}
                    onDuplicateModel={() => duplicateModel(selectedProviderId, modelKey)}
                    fetchedModels={fetchedModels[selectedProviderId]}
                    modelListQuery={modelListQuery}
                    onModelListQueryChange={setModelListQuery}
                    onApplyFetchedModel={(fetched) =>
                      applyFetchedModel(selectedProviderId, modelKey, fetched)
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center text-sm text-white/45">
            尚未配置 Provider
          </div>
        )}
      </div>

      <ModelProviderMenu
        isOpen={menuState !== null}
        providerName={menuState?.providerName ?? ""}
        isEnabled={menuState?.isEnabled ?? false}
        x={menuState?.x ?? 0}
        y={menuState?.y ?? 0}
        anchor={menuState?.anchor ?? null}
        onToggleEnabled={(enabled) => {
          if (menuState) toggleProviderEnabled(menuState.providerKey, enabled)
        }}
        onDuplicate={() => {
          if (menuState) duplicateProvider(menuState.providerKey)
        }}
        onDelete={() => {
          if (menuState) {
            deleteProvider(menuState.providerKey)
            setMenuState(null)
          }
        }}
        onClose={() => setMenuState(null)}
      />
    </div>
  )
}
