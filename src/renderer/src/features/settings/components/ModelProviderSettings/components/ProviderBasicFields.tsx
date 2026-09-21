import { OPENCODE_GO_PROVIDER_ID } from "@shared/opencodeGo"
import { KeyRound } from "lucide-react"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxInput } from "@/components/ui/LxInput"
import { LxSelect } from "@/components/ui/LxSelect"
import { useTranslation } from "@/i18n"
import { PROVIDER_TYPES } from "../constants"
import type { ProviderBasicFieldsProps } from "../types"

/**
 * 渲染选中 Provider 的基础字段卡片。
 */
export const ProviderBasicFields = ({
  providerId,
  provider,
  updateProvider,
  invalidateFetchedModels,
}: ProviderBasicFieldsProps): React.JSX.Element => {
  const { t } = useTranslation()
  // OpenCode Go 的协议按模型内部自适应，provider 级 type 锁定不可改。
  const isOpencodeGo =
    providerId === OPENCODE_GO_PROVIDER_ID || provider.id === OPENCODE_GO_PROVIDER_ID

  return (
    <div className="settings-item-card rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
      <h3 className="mb-3 text-sm font-medium text-white">Provider</h3>
      <div className="grid gap-3 @[380px]:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
          {t("settings.providerId")}
          <LxInput
            value={provider.id}
            onChange={(event) =>
              updateProvider(providerId, (current) => ({
                ...current,
                id: event.target.value,
              }))
            }
          />
        </label>
        <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
          {t("settings.providerName")}
          <LxInput
            value={provider.name}
            onChange={(event) =>
              updateProvider(providerId, (current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </label>
        <div
          className="grid gap-1.5 text-xs text-white/55 min-w-0 @[380px]:col-span-2"
          onClick={(event) => event.preventDefault()}
        >
          <span className="flex items-center gap-1.5">
            {t("settings.providerType")}
            {isOpencodeGo ? (
              <LxInfoTooltip markdown={t("settings.opencodeGoDoc")} placement="right" />
            ) : null}
          </span>
          {isOpencodeGo ? (
            <span className="text-white/85">{t("settings.opencodeGoAutoType")}</span>
          ) : (
            <LxSelect
              value={provider.type}
              options={PROVIDER_TYPES.map((type) => ({ value: type, label: type }))}
              onChange={(event) =>
                updateProvider(providerId, (current) => ({
                  ...current,
                  type: event,
                }))
              }
            />
          )}
        </div>
        <label className="grid gap-1.5 text-xs text-white/55 min-w-0 @[380px]:col-span-2">
          {t("settings.baseUrl")}
          <LxInput
            value={provider.options.baseURL}
            placeholder="https://api.example.com/v1"
            onChange={(event) => {
              invalidateFetchedModels(providerId)
              updateProvider(providerId, (current) => ({
                ...current,
                options: { ...current.options, baseURL: event.target.value },
              }))
            }}
          />
        </label>
        <label className="grid gap-1.5 text-xs text-white/55 min-w-0 @[380px]:col-span-2">
          {t("settings.apiKey")}
          <LxInput
            type="password"
            value={provider.options.apiKey}
            prefix={<KeyRound className="h-3.5 w-3.5 text-white/35" />}
            onChange={(event) => {
              invalidateFetchedModels(providerId)
              updateProvider(providerId, (current) => ({
                ...current,
                options: { ...current.options, apiKey: event.target.value },
              }))
            }}
          />
        </label>
      </div>
    </div>
  )
}
