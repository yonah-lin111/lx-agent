import { useSearchParams } from "react-router-dom"
import { AppIndexDashboard } from "@/features/app-index"
import { ScheduleDashboard } from "@/features/schedule"
import { UsageDashboard } from "@/features/usage"
import { HOME_VIEW_QUERY_KEY, parseHomeView } from "@/lib/homeView"

/**
 * 渲染主页容器：按查询参数切换索引 / 日程 / 用量统计视图（对齐设置页 section 切换模式）。
 */
export const HomePage = (): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const view = parseHomeView(searchParams.get(HOME_VIEW_QUERY_KEY))

  const renderView = (): React.JSX.Element => {
    if (view === "schedule") return <ScheduleDashboard />
    if (view === "usage") return <UsageDashboard />
    return <AppIndexDashboard />
  }

  return (
    <section className="home-page-card flex min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      {renderView()}
    </section>
  )
}
