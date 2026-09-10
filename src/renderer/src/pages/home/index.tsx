import { useSearchParams } from "react-router-dom"
import { OverviewDashboard } from "@/features/overview"
import { HomePlaceholderView } from "./components/HomePlaceholderView"

/**
 * 渲染主页视图页面（支持概览、全局会话与技能工具视图分发）。
 */
export const HomePage = (): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const activeView = searchParams.get("view") ?? "overview"

  const renderContent = (): React.JSX.Element => {
    if (activeView === "sessions") {
      return <HomePlaceholderView type="sessions" />
    }
    if (activeView === "skills") {
      return <HomePlaceholderView type="skills" />
    }
    return <OverviewDashboard />
  }

  return (
    <section className="home-page-card flex min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      {renderContent()}
    </section>
  )
}
