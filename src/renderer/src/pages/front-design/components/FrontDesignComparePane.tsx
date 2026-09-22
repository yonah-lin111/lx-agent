import { ChevronDown, Eye, GitBranch, X } from "lucide-react"
import type React from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import type { FrontDesignItem } from "@/features/agent/hooks/frontDesignStore"
import { useTranslation } from "@/i18n"
import { useComparePreview } from "@/pages/front-design/hooks/useComparePreview"

export interface FrontDesignComparePaneProps {
  // 对照窗当前展示的版本。
  design: FrontDesignItem
  // 可选对照版本（已排除主画布当前版本）。
  options: FrontDesignItem[]
  viewportWidthClass: string
  isDesktop: boolean
  effectiveMode: "light" | "dark"
  onSelectVersion: (id: string) => void
  onClose: () => void
}

/**
 * FrontDesignComparePane - 右侧只读对照窗：版本下拉 + 静态沙箱预览，不承载批注 / 体检 / 令牌提取。
 */
export const FrontDesignComparePane = ({
  design,
  options,
  viewportWidthClass,
  isDesktop,
  effectiveMode,
  onSelectVersion,
  onClose,
}: FrontDesignComparePaneProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { srcDoc } = useComparePreview({
    html: design.html,
    mode: design.mode,
    effectiveMode,
  })

  return (
    <aside
      className="front-design-compare-pane flex min-h-0 min-w-0 flex-1 flex-col border-l"
      style={{ borderColor: "var(--color-theme-border, rgba(255, 255, 255, 0.05))" }}
    >
      <header
        className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3"
        style={{
          backgroundColor: "var(--color-theme-surface-hover)",
          borderColor: "var(--color-theme-border, rgba(255, 255, 255, 0.05))",
        }}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-white/45">
          <Eye className="h-3 w-3 shrink-0 opacity-60" />
          <span className="truncate">{t("frontDesign.compareTitle")}</span>
        </span>

        <div className="flex shrink-0 items-center gap-1.5">
          <LxTooltip
            click={{
              content: (
                <div className="version-menu-dropdown flex flex-col gap-0.5 py-0.5 min-w-[110px]">
                  {options.map((item) => {
                    const isSelected = item.id === design.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectVersion(item.id)}
                        className={`version-menu-option flex w-full cursor-pointer items-center justify-between gap-2 rounded-[4px] px-2 py-1 text-left text-xs transition-colors ${
                          isSelected
                            ? "bg-white/10 font-semibold text-white"
                            : "text-white/70 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <GitBranch className="h-3 w-3 opacity-60" />
                          {t("frontDesign.versionBadge", { version: item.version ?? 1 })}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ),
              placement: "bottom",
              closeOnContentClick: true,
            }}
            hover={{ content: t("frontDesign.compareSelectVersion"), placement: "bottom" }}
          >
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
              style={{ borderColor: "var(--color-theme-border, rgba(255, 255, 255, 0.1))" }}
              aria-label={t("frontDesign.compareSelectVersion")}
            >
              <GitBranch className="h-3 w-3 opacity-70" />
              <span>v{design.version ?? 1}</span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
          </LxTooltip>

          <LxIconButton
            size="small"
            onClick={onClose}
            aria-label={t("frontDesign.compareClose")}
            title={{ content: t("frontDesign.compareClose"), placement: "bottom" }}
          >
            <X />
          </LxIconButton>
        </div>
      </header>

      <main
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-auto ${
          isDesktop ? "p-0" : "p-4"
        }`}
        style={{ backgroundColor: "var(--color-theme-bg)" }}
      >
        <div
          className={`flex h-full w-full ${viewportWidthClass} flex-col overflow-hidden ${
            isDesktop
              ? "rounded-none border-none shadow-none"
              : "rounded-[6px] border border-white/10 shadow-2xl"
          } transition-[max-width] duration-300 ease-in-out`}
          style={{ backgroundColor: "var(--color-theme-surface)" }}
        >
          <iframe
            key={`${design.id}-${effectiveMode}`}
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-same-origin"
            title={t("frontDesign.compareTitle")}
            className={`h-full w-full border-none ${
              effectiveMode === "dark" ? "bg-[#0b0f19]" : "bg-white"
            }`}
          />
        </div>
      </main>
    </aside>
  )
}
