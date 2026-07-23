import { BottomSidebar } from "@/components/layout/BottomSidebar"
import { Header } from "@/components/layout/Header"
import { LeftSideBar } from "@/components/layout/LeftSideBar"
import { PageContent } from "@/components/layout/PageContent"
import { RightSidebar } from "@/components/layout/RightSidebar"

/**
 * 渲染应用根节点。
 */
export const App = () => {
  return (
    <div className="flex h-screen w-screen flex-col gap-3 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden">
      <LeftSideBar />
      <div className="flex h-auto min-w-0 flex-1 flex-col overflow-hidden lg:h-full">
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col">
            <Header />
            <PageContent />
          </div>
          <RightSidebar />
        </div>
        <div className="mt-3">
          <BottomSidebar />
        </div>
      </div>
    </div>
  )
}
