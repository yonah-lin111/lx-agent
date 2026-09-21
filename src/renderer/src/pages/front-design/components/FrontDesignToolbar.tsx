import {
  Check,
  ChevronDown,
  Copy,
  Eraser,
  FolderOpen,
  GitBranch,
  Laptop,
  MousePointerClick,
  Palette,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react"
import type React from "react"
import { useMemo } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMenuItem } from "@/components/ui/LxMenuItem"
import { LxTooltip } from "@/components/ui/LxTooltip"
import type { FrontDesignItem } from "@/features/agent/hooks/frontDesignStore"
import { useTranslation } from "@/i18n"
import type { FrontDesignPageTheme } from "@/pages/front-design/hooks/useDesignTheme"
import type { ViewportMode } from "@/pages/front-design/types"

export interface FrontDesignToolbarProps {
  mode?: "tailwindcss" | "css"
  hasHtml: boolean
  version: number
  availableVersions: FrontDesignItem[]
  activeDesignId: string | null
  onSelectVersion: (id: string) => void
  onClearCanvas: () => void
  onRefresh: () => void
  viewport: ViewportMode
  onViewportChange: (viewport: ViewportMode) => void
  isStreaming: boolean
  isInspectorActive: boolean
  onToggleInspector: () => void
  sessionId: string | null
  onOpenDesignDir: () => void
  onCopy: () => void
  copied: boolean
  pageTheme: FrontDesignPageTheme
  onSelectTheme: (theme: FrontDesignPageTheme) => void
}

/**
 * FrontDesignToolbar - 设计画布顶部工具栏：版本切换、视口预设、Inspector、主题与复制。
 */
export const FrontDesignToolbar = ({
  mode,
  hasHtml,
  version,
  availableVersions,
  activeDesignId,
  onSelectVersion,
  onClearCanvas,
  onRefresh,
  viewport,
  onViewportChange,
  isStreaming,
  isInspectorActive,
  onToggleInspector,
  sessionId,
  onOpenDesignDir,
  onCopy,
  copied,
  pageTheme,
  onSelectTheme,
}: FrontDesignToolbarProps): React.JSX.Element => {
  const { t } = useTranslation()

  const themeOptions: { id: FrontDesignPageTheme; label: string }[] = useMemo(
    () => [
      { id: "system", label: t("frontDesign.themeSystem") },
      { id: "light", label: t("frontDesign.themeLight") },
      { id: "dark", label: t("frontDesign.themeDark") },
    ],
    [t],
  )

  const inspectorTooltipContent = useMemo(() => {
    if (isStreaming) {
      return t("frontDesign.generating")
    }
    return (
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-white/90">
            {isInspectorActive ? t("frontDesign.inspectModeActive") : t("frontDesign.inspectMode")}
          </span>
        </div>
        <div className="border-t border-white/10 pt-1 text-xs text-white/45">
          {t("frontDesign.inspectShortcutHint")}
        </div>
      </div>
    )
  }, [isStreaming, isInspectorActive, t])

  return (
    <header
      className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3"
      style={{
        backgroundColor: "var(--color-theme-surface-hover)",
        borderColor: "var(--color-theme-border, rgba(255, 255, 255, 0.05))",
      }}
    >
      {/* 左侧：版本、模式与刷新 */}
      <div className="flex flex-1 items-center gap-2 min-w-0">
        {hasHtml && (
          <span className="front-design-badge shrink-0 rounded border border-pink-500/20 bg-pink-500/10 px-1.5 py-0.5 text-xs font-medium text-pink-300">
            {mode === "css" ? t("frontDesign.pureCssMode") : t("frontDesign.tailwindMode")}
          </span>
        )}

        {/* 版本指示与切换器：若有多版本则显示下拉菜单，单版本时显示当前版本号静态徽标 */}
        {availableVersions.length > 1 ? (
          <LxTooltip
            click={{
              content: (
                <div className="version-menu-dropdown flex flex-col gap-0.5 py-0.5 min-w-[110px]">
                  {availableVersions.map((v) => {
                    const isSelected = v.id === activeDesignId
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => onSelectVersion(v.id)}
                        className={`version-menu-option flex w-full cursor-pointer items-center justify-between gap-2 rounded-[4px] px-2 py-1 text-left text-xs transition-colors ${
                          isSelected
                            ? "bg-white/10 font-semibold text-white"
                            : "text-white/70 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <GitBranch className="h-3 w-3 opacity-60" />
                          {t("frontDesign.versionBadge", { version: v.version ?? 1 })}
                        </span>
                        {isSelected && <Check className="h-3 w-3 shrink-0 text-emerald-400" />}
                      </button>
                    )
                  })}
                </div>
              ),
              placement: "bottom",
              closeOnContentClick: true,
            }}
          >
            <button
              type="button"
              className="flex items-center gap-1 rounded border border-pink-500/30 bg-pink-500/15 px-1.5 py-0.5 text-xs font-medium text-pink-300 hover:bg-pink-500/25 transition-colors cursor-pointer"
              aria-label={t("frontDesign.selectVersion")}
            >
              <GitBranch className="h-3 w-3" />
              <span>v{version}</span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
          </LxTooltip>
        ) : activeDesignId && hasHtml ? (
          <span className="flex items-center gap-1 rounded border border-pink-500/20 bg-pink-500/10 px-1.5 py-0.5 text-xs font-mono font-medium text-pink-300 select-none">
            <GitBranch className="h-3 w-3 opacity-70" />
            <span>v{version}</span>
          </span>
        ) : null}

        <LxIconButton
          size="small"
          onClick={onRefresh}
          aria-label={t("frontDesign.refreshPreview")}
          title={{ content: t("frontDesign.refreshPreview"), placement: "bottom" }}
        >
          <RefreshCw />
        </LxIconButton>
      </div>

      {/* 中间：视口预设切换（桌面 / 平板 / 移动） */}
      <div className="flex shrink-0 items-center justify-center">
        <div
          className="flex items-center rounded-[6px] p-0.5 border"
          style={{
            backgroundColor: "var(--color-theme-bg)",
            borderColor: "var(--color-theme-border, rgba(255, 255, 255, 0.05))",
          }}
        >
          <LxIconButton
            size="small"
            highlighted={viewport === "desktop"}
            onClick={() => onViewportChange("desktop")}
            aria-label={t("frontDesign.viewportDesktop")}
            title={{ content: t("frontDesign.viewportDesktop"), placement: "bottom" }}
          >
            <Laptop />
          </LxIconButton>
          <LxIconButton
            size="small"
            highlighted={viewport === "tablet"}
            onClick={() => onViewportChange("tablet")}
            aria-label={t("frontDesign.viewportTablet")}
            title={{ content: t("frontDesign.viewportTablet"), placement: "bottom" }}
          >
            <Tablet />
          </LxIconButton>
          <LxIconButton
            size="small"
            highlighted={viewport === "mobile"}
            onClick={() => onViewportChange("mobile")}
            aria-label={t("frontDesign.viewportMobile")}
            title={{ content: t("frontDesign.viewportMobile"), placement: "bottom" }}
          >
            <Smartphone />
          </LxIconButton>
        </div>
      </div>

      {/* 右侧：工具与操作 */}
      <div className="flex flex-1 items-center justify-end gap-1.5 min-w-0">
        {/* 点选微调 Inspector */}
        {activeDesignId && hasHtml && (
          <LxIconButton
            size="small"
            disabled={isStreaming}
            highlighted={isInspectorActive}
            onClick={onToggleInspector}
            aria-label={t("frontDesign.inspectMode")}
            title={{
              content: inspectorTooltipContent,
              placement: "bottom",
            }}
          >
            <MousePointerClick />
          </LxIconButton>
        )}

        <div
          className="h-3.5 w-[1px] mx-0.5"
          style={{ backgroundColor: "var(--color-theme-border, rgba(255, 255, 255, 0.1))" }}
        />

        {/* 打开工程目录 */}
        {sessionId && activeDesignId && (
          <LxIconButton
            size="small"
            onClick={onOpenDesignDir}
            aria-label={t("frontDesign.openDesignDir")}
            title={{ content: t("frontDesign.openDesignDir"), placement: "bottom" }}
          >
            <FolderOpen />
          </LxIconButton>
        )}

        {/* 设计页面主题切换（复刻 HeaderSideBar Palette 图标风格） */}
        <LxTooltip
          hover={{
            content: t("frontDesign.theme"),
            placement: "bottom",
          }}
          click={{
            content: (
              <div className="theme-menu-dropdown flex flex-col gap-0.5 py-0.5 min-w-[95px]">
                {themeOptions.map((opt) => {
                  const isSelected = pageTheme === opt.id
                  return (
                    <LxMenuItem
                      key={opt.id}
                      active={isSelected}
                      trailing={isSelected ? <Check className="text-emerald-400" /> : null}
                      onClick={() => onSelectTheme(opt.id)}
                    >
                      {opt.label}
                    </LxMenuItem>
                  )
                })}
              </div>
            ),
            placement: "bottom",
            closeOnContentClick: true,
          }}
        >
          <LxIconButton aria-label={t("frontDesign.theme")} size="small">
            <Palette />
          </LxIconButton>
        </LxTooltip>

        <div
          className="h-3.5 w-[1px] mx-0.5"
          style={{ backgroundColor: "var(--color-theme-border, rgba(255, 255, 255, 0.1))" }}
        />

        {/* 复制代码 */}
        <LxIconButton
          size="small"
          disabled={!hasHtml}
          onClick={onCopy}
          aria-label={t("frontDesign.copyCode")}
          title={{ content: t("frontDesign.copyCode"), placement: "bottom" }}
        >
          {copied ? <Check className="text-emerald-400" /> : <Copy />}
        </LxIconButton>

        {/* 清空画布 */}
        <LxIconButton
          size="small"
          disabled={!activeDesignId && !hasHtml}
          onClick={onClearCanvas}
          aria-label={t("frontDesign.clearCanvas")}
          title={{ content: t("frontDesign.clearCanvas"), placement: "bottom" }}
        >
          <Eraser />
        </LxIconButton>
      </div>
    </header>
  )
}
