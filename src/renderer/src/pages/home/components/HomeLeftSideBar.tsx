import { BarChart3, LayoutDashboard, type LucideIcon } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { LxTooltip } from "@/components/ui/LxTooltip"
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
              <LxTooltip key={item.view} content={t(item.labelKey)} placement="right">
                <LxNavItem
                  aria-current={isActive ? "page" : undefined}
                  aria-label={t(item.labelKey)}
                  className={`w-full justify-center ${
                    isActive ? "bg-white/5 text-white" : "text-white/70"
                  }`}
                  onClick={() => handleSelect(item.view)}
                  prefix={<Icon className="h-3.5 w-3.5 shrink-0" />}
                />
              </LxTooltip>
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
            <LxNavItem
              key={item.view}
              aria-current={isActive ? "page" : undefined}
              className={isActive ? "bg-white/5 text-white" : "text-white/70"}
              onClick={() => handleSelect(item.view)}
              prefix={<Icon className={`h-3.5 w-3.5 shrink-0 ${item.iconClassName}`} />}
            >
              <span className="min-w-0 flex-1 truncate select-none">{t(item.labelKey)}</span>
            </LxNavItem>
          )
        })}
      </nav>
    </div>
  )
}
