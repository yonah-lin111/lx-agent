import { OverviewDashboard } from "@/features/overview"

/**
 * 渲染主页概览视图页面。
 */
export const HomePage = (): React.JSX.Element => {
  return (
    <section className="home-page-card flex min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      <OverviewDashboard />
    </section>
  )
}
