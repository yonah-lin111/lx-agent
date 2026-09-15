import { CheckCircle2, Circle } from "lucide-react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { useTranslation } from "@/i18n"
import type { ProviderNavProps } from "../types"

/**
 * 渲染左侧 Provider 导航列表与右键菜单入口。
 */
export const ProviderNav = ({
  providers,
  selectedProviderId,
  enabledProviders,
  onSelect,
  onToggleEnabled,
  onOpenContextMenu,
}: ProviderNavProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <nav
      className="min-h-0 overflow-y-auto border-r border-white/8 pr-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      aria-label={t("settings.providers")}
    >
      <div className="flex flex-col gap-1">
        {Object.entries(providers).map(([providerKey, provider]) => {
          const isSelected = providerKey === selectedProviderId
          const isEnabled = enabledProviders.includes(providerKey)
          return (
            <LxNavItem
              key={providerKey}
              level={2}
              className={`w-full ${isSelected ? "bg-white/5 text-white" : "text-white/70"}`}
              aria-current={isSelected ? "true" : undefined}
              onClick={() => onSelect(providerKey)}
              onContextMenu={(event) => {
                event.preventDefault()
                onOpenContextMenu(
                  providerKey,
                  provider.name || provider.id,
                  isEnabled,
                  event.clientX,
                  event.clientY,
                )
              }}
            >
              <LxIconButton
                shape="circle"
                showHoverBg={false}
                aria-label={isEnabled ? t("common.enabled") : t("common.disabled")}
                title={{ content: isEnabled ? t("common.enabled") : t("common.disabled") }}
                className="-m-0.5 shrink-0"
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleEnabled(providerKey, !isEnabled)
                }}
              >
                {isEnabled ? (
                  <CheckCircle2 className="text-emerald-400/80" />
                ) : (
                  <Circle className="text-white/30" />
                )}
              </LxIconButton>
              <span className="min-w-0 flex-1 truncate select-none">
                {provider.name || provider.id}
              </span>
            </LxNavItem>
          )
        })}
      </div>
    </nav>
  )
}
