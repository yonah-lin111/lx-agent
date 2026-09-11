import { BarChart3, LayoutDashboard, type LucideIcon } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { type TranslationKey, useTranslation } from "@/i18n"
import { HOME_VIEW_QUERY_KEY, type HomeView, parseHomeView } from "@/lib/homeView"

export interface HomeLeftSideBarProps {
  isCollapsed?: boolean
}

// 主页侧栏导航项（view 对应 ?view= 查询参数）。
interface HomeNavItem {
  view: HomeView
  labelKey: TranslationKey
  icon: LucideIcon
  iconClassName: string
}

const HOME_NAV_ITEMS: HomeNavItem[] = [
  {
    view: "overview",
    labelKey: "home.overview",
    icon: LayoutDashboard,
    iconClassName: "text-sky-400",
  },
  {
    view: "usage",
    labelKey: "usage.title",
    icon: BarChart3,
    iconClassName: "text-emerald-400",
  },
]

/**
 * 渲染主页专属左侧栏内容（概览 / 用量统计，参考 SettingsLeftSideBar 布局规范）。
 */
export const HomeLeftSideBar = ({
  isCollapsed = false,
}: HomeLeftSideBarProps): React.JSX.Element => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const activeView: HomeView = parseHomeView(searchParams.get(HOME_VIEW_QUERY_KEY))

  const handleSelect = (view: HomeView): void => {
    navigate(view === "overview" ? "/" : `/?view=${view}`)
  }

  if (isCollapsed) {
    return (
      <div className="flex h-full w-full min-w-0 flex-col items-center gap-3">
        {/* 顶部留出折叠展开切换按钮高度 */}
        <div className="flex h-7 shrink-0 items-center justify-center px-1" />
        <nav
          className="custom-scrollbar flex min-h-0 w-full flex-1 flex-col items-center space-y-1 overflow-y-auto pb-2"
          aria-label={t("nav.home")}
        >
          {HOME_NAV_ITEMS.map((item) => {
            const isActive = activeView === item.view
            const Icon = item.icon
            return (
              <LxIconButton
                key={item.view}
                size="small"
                aria-current={isActive ? "page" : undefined}
                aria-label={t(item.labelKey)}
                title={{ content: t(item.labelKey), placement: "right" }}
                highlighted={isActive}
                onClick={() => handleSelect(item.view)}
              >
                <Icon className="h-3.5 w-3.5" />
              </LxIconButton>
            )
          })}
        </nav>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      {/* 顶部标题与折叠留白区域 */}
      <div className="flex h-7 shrink-0 items-center justify-between pl-7 pr-1">
        <span className="text-xs font-semibold text-[var(--color-theme-text-muted)] truncate">
          {t("nav.home")}
        </span>
      </div>

      {/* 导航列表区 */}
      <nav
        className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-2 [scrollbar-gutter:stable]"
        aria-label={t("nav.home")}
      >
        {HOME_NAV_ITEMS.map((item) => {
          const isActive = activeView === item.view
          const Icon = item.icon
          return (
            <button
              key={item.view}
              type="button"
              aria-current={isActive ? "page" : undefined}
              className={`home-sidebar-item group flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 cursor-pointer ${
                isActive
                  ? "bg-[var(--color-theme-surface-hover)] text-[var(--color-theme-text)] font-medium"
                  : "text-[var(--color-theme-text-muted)] hover:bg-[var(--color-theme-surface-hover)] hover:text-[var(--color-theme-text)]"
              }`}
              onClick={() => handleSelect(item.view)}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${item.iconClassName}`} />
              <span className="min-w-0 flex-1 truncate select-none text-xs">
                {t(item.labelKey)}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
