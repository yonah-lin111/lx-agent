import { LayoutDashboard } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

export interface HomeLeftSideBarProps {
  isCollapsed?: boolean
}

/**
 * 渲染主页专属左侧栏内容（参考 ProjectNavigationList 布局规范）。
 */
export const HomeLeftSideBar = ({
  isCollapsed = false,
}: HomeLeftSideBarProps): React.JSX.Element => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const activeView = searchParams.get("view") ?? "overview"
  const isOverviewActive = activeView === "overview"

  const handleSelectOverview = (): void => {
    navigate(PAGE_ROUTES.home)
  }

  if (isCollapsed) {
    return (
      <div className="flex h-full w-full min-w-0 flex-col items-center gap-3">
        {/* 顶部留出折叠展开切换按钮高度 */}
        <div className="flex h-7 shrink-0 items-center justify-center px-1" />
        <nav
          className="custom-scrollbar flex min-h-0 w-full flex-1 flex-col items-center space-y-1 overflow-y-auto pb-2"
          aria-label={t("home.overview")}
        >
          <LxIconButton
            size="small"
            aria-current={isOverviewActive ? "page" : undefined}
            aria-label={t("home.overview")}
            title={{ content: t("home.overview"), placement: "right" }}
            highlighted={isOverviewActive}
            onClick={handleSelectOverview}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
          </LxIconButton>
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
        aria-label={t("home.overview")}
      >
        <div
          role="button"
          tabIndex={0}
          data-item-level="prompt"
          aria-current={isOverviewActive ? "page" : undefined}
          className={`home-sidebar-item group flex h-7 items-center gap-2 rounded-[6px] px-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 cursor-pointer ${
            isOverviewActive
              ? "bg-white/10 text-white font-medium shadow-xs"
              : "text-white/70 hover:bg-white/5"
          }`}
          onClick={handleSelectOverview}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              handleSelectOverview()
            }
          }}
        >
          <LayoutDashboard
            className={`h-3.5 w-3.5 shrink-0 ${
              isOverviewActive ? "text-sky-400" : "text-white/45"
            }`}
          />
          <span className="min-w-0 flex-1 truncate select-none text-xs">{t("home.overview")}</span>
        </div>
      </nav>
    </div>
  )
}
