import { BarChart3, LayoutDashboard, type LucideIcon } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { type TranslationKey, useTranslation } from "@/i18n"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

export interface HomeLeftSideBarProps {
  isCollapsed?: boolean
}

// 主页侧栏导航项。
interface HomeNavItem {
  route: string
  labelKey: TranslationKey
  icon: LucideIcon
  iconClassName: string
}

const HOME_NAV_ITEMS: HomeNavItem[] = [
  {
    route: PAGE_ROUTES.home,
    labelKey: "home.overview",
    icon: LayoutDashboard,
    iconClassName: "text-sky-400",
  },
  {
    route: PAGE_ROUTES.usage,
    labelKey: "usage.title",
    icon: BarChart3,
    iconClassName: "text-emerald-400",
  },
]

/**
 * 渲染主页专属左侧栏内容（概览 / 用量统计，参考 ProjectNavigationList 布局规范）。
 */
export const HomeLeftSideBar = ({
  isCollapsed = false,
}: HomeLeftSideBarProps): React.JSX.Element => {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { t } = useTranslation()

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
            const isActive = pathname === item.route
            const Icon = item.icon
            return (
              <LxIconButton
                key={item.route}
                size="small"
                aria-current={isActive ? "page" : undefined}
                aria-label={t(item.labelKey)}
                title={{ content: t(item.labelKey), placement: "right" }}
                highlighted={isActive}
                onClick={() => navigate(item.route)}
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
        <span className="text-xs font-semibold text-white/80 truncate">{t("nav.home")}</span>
      </div>

      {/* 导航列表区 */}
      <nav
        className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-2 [scrollbar-gutter:stable]"
        aria-label={t("nav.home")}
      >
        {HOME_NAV_ITEMS.map((item) => {
          const isActive = pathname === item.route
          const Icon = item.icon
          return (
            <div
              key={item.route}
              role="button"
              tabIndex={0}
              data-item-level="prompt"
              aria-current={isActive ? "page" : undefined}
              className={`home-sidebar-item group flex h-7 items-center gap-2 rounded-[6px] px-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 cursor-pointer ${
                isActive
                  ? "bg-[#2a2a2a] text-white font-medium shadow-xs"
                  : "text-white/70 hover:bg-white/[0.04] hover:text-white"
              }`}
              onClick={() => navigate(item.route)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  navigate(item.route)
                }
              }}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${item.iconClassName}`} />
              <span className="min-w-0 flex-1 truncate select-none text-xs">
                {t(item.labelKey)}
              </span>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
