import { isBuiltinProviderId } from "@shared/opencodeGo"
import { CheckCircle2, Circle, Plus } from "lucide-react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { useTranslation } from "@/i18n"
import type { ProviderNavProps } from "../types"
import { isOpencodeGoMissing } from "../utils"

// 普通行底色：仅选中态浅底。
const defaultRowClass = (isSelected: boolean): string =>
  isSelected ? "bg-white/5 text-white" : "text-white/70"

// 预设行底色：主题 accent 淡 tint + 左侧实色条；选中加深。
// 全经 CSS Token 取色（含像素主题），不硬编码颜色。
const presetRowClass = (isSelected: boolean): string =>
  isSelected
    ? "bg-[color-mix(in_srgb,var(--color-theme-accent)_18%,transparent)] text-white shadow-[inset_2px_0_0_var(--color-theme-accent)]"
    : "bg-[color-mix(in_srgb,var(--color-theme-accent)_10%,transparent)] text-white/70 shadow-[inset_2px_0_0_var(--color-theme-accent)]"

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
  onAddOpencodeGo,
}: ProviderNavProps): React.JSX.Element => {
  const { t } = useTranslation()
  // 仅当预设未创建且调用方提供入口时展示一键添加。
  const showAddOpencodeGo = onAddOpencodeGo !== undefined && isOpencodeGoMissing(providers)

  return (
    <nav
      className="flex min-h-0 flex-col border-r border-white/8 pr-2"
      aria-label={t("settings.providers")}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {Object.entries(providers)
          // 内置预设始终置顶，其余保持原有相对顺序。
          .sort(
            ([leftKey], [rightKey]) =>
              Number(isBuiltinProviderId(rightKey)) - Number(isBuiltinProviderId(leftKey)),
          )
          .map(([providerKey, provider]) => {
            const isSelected = providerKey === selectedProviderId
            const isEnabled = enabledProviders.includes(providerKey)
            const rowClass = isBuiltinProviderId(providerKey)
              ? presetRowClass(isSelected)
              : defaultRowClass(isSelected)
            return (
              <LxNavItem
                key={providerKey}
                level={2}
                className={`w-full ${rowClass}`}
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
                    event.currentTarget as HTMLElement,
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
      {showAddOpencodeGo ? (
        <div className="shrink-0 pt-1">
          <LxNavItem
            level={2}
            className="w-full text-white/70"
            aria-label={t("settings.addOpencodeGo")}
            onClick={onAddOpencodeGo}
            prefix={<Plus className="h-3.5 w-3.5 shrink-0 text-white/45" />}
            suffix={
              <span
                className="flex shrink-0 items-center"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <LxInfoTooltip markdown={t("settings.opencodeGoDoc")} placement="right" />
              </span>
            }
          >
            <span className="min-w-0 flex-1 truncate select-none">
              {t("settings.addOpencodeGo")}
            </span>
          </LxNavItem>
        </div>
      ) : null}
    </nav>
  )
}
