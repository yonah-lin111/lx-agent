import { Search } from "lucide-react"
import { LxInput } from "@/components/ui/LxInput"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { useTranslation } from "@/i18n"
import type { FetchedModelsContentProps } from "../types"
import { fuzzyMatches } from "../utils"

/**
 * 渲染取回的模型列表：支持模糊过滤并点击应用。
 */
export const FetchedModelsContent = ({
  models,
  query,
  onQueryChange,
  onApply,
}: FetchedModelsContentProps): React.JSX.Element => {
  const { t } = useTranslation()
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredModels = normalizedQuery
    ? models.filter((model) => fuzzyMatches(`${model.id} ${model.ownedBy ?? ""}`, normalizedQuery))
    : models

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 font-normal">
      <div onClick={(event) => event.stopPropagation()}>
        <LxInput
          aria-label={t("common.search")}
          placeholder={t("common.search")}
          prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {models.length === 0 ? (
          <div className="py-1 text-white/45">{t("settings.noModelsConfigured")}</div>
        ) : filteredModels.length === 0 ? (
          <div className="py-1 text-white/45">{t("settings.noModelsConfigured")}</div>
        ) : (
          filteredModels.map((model) => (
            <LxNavItem
              key={model.id}
              size="small"
              level={3}
              className="w-full justify-between gap-3 text-white/80 hover:text-white"
              onClick={() => onApply(model)}
            >
              <span className="min-w-0 truncate">{model.id}</span>
              {model.ownedBy ? (
                <span className="shrink-0 text-xs text-white/35">{model.ownedBy}</span>
              ) : null}
            </LxNavItem>
          ))
        )}
      </div>
    </div>
  )
}
