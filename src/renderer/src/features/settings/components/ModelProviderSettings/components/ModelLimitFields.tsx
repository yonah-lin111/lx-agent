import { LxInput } from "@/components/ui/LxInput"
import { useTranslation } from "@/i18n"
import type { ModelLimitFieldsProps } from "../types"

/**
 * 渲染模型上下文窗口、最大输出与模态配置。
 */
export const ModelLimitFields = ({
  providerId,
  modelKey,
  model,
  updateProvider,
}: ModelLimitFieldsProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="mt-3 grid gap-3 border-t border-white/8 pt-3 @[360px]:grid-cols-2 @[580px]:grid-cols-4">
      <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
        {t("settings.contextWindow")}
        <LxInput
          type="number"
          aria-label={`${modelKey} ${t("settings.contextWindow")}`}
          value={model.limit?.context || ""}
          onChange={(event) =>
            updateProvider(providerId, (provider) => ({
              ...provider,
              models: {
                ...provider.models,
                [modelKey]: {
                  ...provider.models[modelKey],
                  limit: {
                    context: event.target.value === "" ? 0 : Number(event.target.value),
                    output: provider.models[modelKey].limit?.output ?? 4096,
                  },
                },
              },
            }))
          }
        />
      </label>
      <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
        {t("settings.maxOutputTokens")}
        <LxInput
          type="number"
          aria-label={`${modelKey} ${t("settings.maxOutputTokens")}`}
          value={model.limit?.output || ""}
          onChange={(event) =>
            updateProvider(providerId, (provider) => ({
              ...provider,
              models: {
                ...provider.models,
                [modelKey]: {
                  ...provider.models[modelKey],
                  limit: {
                    context: provider.models[modelKey].limit?.context ?? 8192,
                    output: event.target.value === "" ? 0 : Number(event.target.value),
                  },
                },
              },
            }))
          }
        />
      </label>
      <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
        Modalities (In)
        <LxInput
          value={(model.modalities?.input ?? ["text"]).join(", ")}
          onChange={(event) =>
            updateProvider(providerId, (provider) => ({
              ...provider,
              models: {
                ...provider.models,
                [modelKey]: {
                  ...provider.models[modelKey],
                  modalities: {
                    input: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                    output: provider.models[modelKey].modalities?.output ?? ["text"],
                  },
                },
              },
            }))
          }
        />
      </label>
      <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
        Modalities (Out)
        <LxInput
          value={(model.modalities?.output ?? ["text"]).join(", ")}
          onChange={(event) =>
            updateProvider(providerId, (provider) => ({
              ...provider,
              models: {
                ...provider.models,
                [modelKey]: {
                  ...provider.models[modelKey],
                  modalities: {
                    input: provider.models[modelKey].modalities?.input ?? ["text"],
                    output: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  },
                },
              },
            }))
          }
        />
      </label>
    </div>
  )
}
