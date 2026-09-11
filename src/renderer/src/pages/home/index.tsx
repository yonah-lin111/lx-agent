import { useSearchParams } from "react-router-dom"
import { OverviewDashboard } from "@/features/overview"
import { UsageDashboard } from "@/features/usage"
import { HOME_VIEW_QUERY_KEY, parseHomeView } from "@/lib/homeView"

/**
 * 渲染主页容器：按查询参数切换概览与用量统计视图（对齐设置页 section 切换模式）。
 */
export const HomePage = (): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const view = parseHomeView(searchParams.get(HOME_VIEW_QUERY_KEY))

  return (
    <section className="home-page-card flex min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      {view === "usage" ? <UsageDashboard /> : <OverviewDashboard />}
    </section>
  )
}
