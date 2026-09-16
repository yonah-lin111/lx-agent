import {
  BarChart3,
  Bot,
  Boxes,
  CalendarCheck,
  Component,
  type LucideIcon,
  MessageSquarePlus,
  Palette,
  Settings,
} from "lucide-react"
import { useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { type TranslationKey, useTranslation } from "@/i18n"
import { HOME_VIEW_QUERY_KEY } from "@/lib/homeView"
import { PAGE_ROUTES } from "@/lib/pageRoutes"
import logoImg from "../../../../../../resources/icons/lx-op-logo.png"
import { useDailyActivity } from "../hooks/useDailyActivity"
import { ActivityHeatmap } from "./ActivityHeatmap"

// 快速入口定义。
interface QuickEntry {
  id: string
  labelKey: TranslationKey
  descriptionKey: TranslationKey
  icon: LucideIcon
  iconClassName: string
  // 目标路由（新建对话入口无路由）。
  path?: string
  // 主入口：新建对话使用强调色边框与图标。
  isPrimary?: boolean
}

const QUICK_ENTRIES: QuickEntry[] = [
  {
    id: "newChat",
    labelKey: "home.index.newChat",
    descriptionKey: "home.index.newChatDesc",
    icon: MessageSquarePlus,
    iconClassName: "text-sky-400",
    isPrimary: true,
  },
  {
    id: "projects",
    labelKey: "nav.project",
    descriptionKey: "home.index.projectsDesc",
    icon: Boxes,
    iconClassName: "text-amber-400",
    path: PAGE_ROUTES.project,
  },
  {
    id: "schedule",
    labelKey: "home.schedule",
    descriptionKey: "home.index.scheduleDesc",
    icon: CalendarCheck,
    iconClassName: "text-violet-400",
    path: `${PAGE_ROUTES.home}?${HOME_VIEW_QUERY_KEY}=schedule`,
  },
  {
    id: "usage",
    labelKey: "usage.title",
    descriptionKey: "home.index.usageDesc",
    icon: BarChart3,
    iconClassName: "text-emerald-400",
    path: `${PAGE_ROUTES.home}?${HOME_VIEW_QUERY_KEY}=usage`,
  },
  {
    id: "design",
    labelKey: "nav.design",
    descriptionKey: "home.index.designDesc",
    icon: Palette,
    iconClassName: "text-fuchsia-400",
    path: PAGE_ROUTES.design,
  },
  {
    id: "openclaw",
    labelKey: "nav.openclaw",
    descriptionKey: "home.index.openclawDesc",
    icon: Bot,
    iconClassName: "text-cyan-400",
    path: PAGE_ROUTES.openclaw,
  },
  {
    id: "ui",
    labelKey: "nav.ui",
    descriptionKey: "home.index.uiDesc",
    icon: Component,
    iconClassName: "text-indigo-400",
    path: PAGE_ROUTES.ui,
  },
  {
    id: "settings",
    labelKey: "nav.settings",
    descriptionKey: "home.index.settingsDesc",
    icon: Settings,
    iconClassName: "text-white/60",
    path: PAGE_ROUTES.settings,
  },
]

/**
 * 渲染应用索引页：品牌 Hero、全量页面快速入口与年度会话活跃度绿墙。
 */
export const AppIndexDashboard = (): React.JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { warning } = useLxToast()
  const { entries, isLoading, error, refresh } = useDailyActivity()

  const handleEntryClick = useCallback(
    (entry: QuickEntry): void => {
      if (entry.id === "newChat") {
        if (!agentTabStore.createTab()) {
          warning(t("agent.maxTabsReached"))
        }
        return
      }
      if (entry.path) {
        navigate(entry.path)
      }
    },
    [navigate, t, warning],
  )

  return (
    <div className="app-index-container relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 custom-scrollbar [scrollbar-gutter:stable] [contain:paint] [transform:translateZ(0)]">
      <LxLoadingOverlay
        isLoading={isLoading && entries.length === 0}
        text={t("home.index.loading")}
      />

      {/* 1. 品牌 Hero：logo + 产品定位说明 */}
      <section className="app-index-hero flex min-w-0 items-center gap-4 rounded-[6px] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-5">
        <img
          src={logoImg}
          alt="LX Agent"
          className="app-index-logo h-16 w-16 shrink-0 rounded-2xl object-contain drop-shadow-md select-none pointer-events-none"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold tracking-[0.18em] text-[var(--color-theme-text)]">
              LX AGENT
            </span>
            <LxTag
              size="small"
              bgClass="border-white/10 bg-white/5"
              textClass="text-white/40"
              className="font-mono"
            >
              {t("home.index.badge")}
            </LxTag>
          </div>
          <p className="mt-1.5 truncate text-sm text-[var(--color-theme-text)]">
            {t("home.index.tagline")}
          </p>
          <p className="mt-1.5 max-w-[560px] text-xs leading-relaxed text-[var(--color-theme-text-muted)]">
            {t("home.index.introduction")}
          </p>
        </div>
      </section>

      {error ? (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-[6px] border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <span className="truncate">{error}</span>
          <button
            type="button"
            className="shrink-0 underline-offset-2 hover:underline"
            onClick={() => void refresh()}
          >
            {t("common.refresh")}
          </button>
        </div>
      ) : null}

      {/* 2. 全量页面快速入口（4 × 2 网格，窄屏自动降列） */}
      <section className="mt-5 flex min-w-0 flex-col gap-2">
        <h2 className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
          {t("home.index.quickEntries")}
        </h2>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_ENTRIES.map((entry, index) => {
            const Icon = entry.icon
            return (
              <button
                key={entry.id}
                type="button"
                aria-label={t(entry.labelKey)}
                onClick={() => handleEntryClick(entry)}
                style={{ animationDelay: `${index * 24}ms` }}
                className={`app-index-entry animate-app-index-entry-in group flex min-w-0 items-start gap-2.5 rounded-[6px] border p-3 text-left transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px ${
                  entry.isPrimary
                    ? "border-[var(--color-theme-accent)]/45 bg-[var(--color-theme-surface-hover)] hover:border-[var(--color-theme-accent)]"
                    : "border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] hover:border-[var(--color-theme-border-strong)] hover:bg-[var(--color-theme-surface-hover)]"
                }`}
              >
                <span className="shrink-0 pt-0.5 font-mono text-[10px] leading-none text-[var(--color-theme-text-subtle)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${entry.iconClassName}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--color-theme-text)]">
                    {t(entry.labelKey)}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-theme-text-muted)]">
                    {t(entry.descriptionKey)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* 3. 年度会话活跃度绿墙 */}
      <section className="mt-5">
        <ActivityHeatmap entries={entries} />
      </section>
    </div>
  )
}
