import { BottomSidebar } from "@/components/layout/BottomSidebar"
import { Header } from "@/components/layout/Header"
import { LeftSideBar } from "@/components/layout/LeftSideBar"
import { PageContent } from "@/components/layout/PageContent"
import { RightSidebar } from "@/components/layout/RightSidebar"
import { useState } from "react"

/**
 * 渲染应用根节点。
 */
export const App = () => {
  const [isBottomSidebarCoveringRightSidebar, setIsBottomSidebarCoveringRightSidebar] =
    useState<boolean>(true)

  return (
    <div className="flex h-screen w-screen flex-col gap-2 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden">
      <LeftSideBar />
      <div className="flex h-auto min-w-0 flex-1 flex-col overflow-hidden lg:h-full">
        <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col">
            <Header />
            <PageContent />
          </div>
          <div className={isBottomSidebarCoveringRightSidebar ? "" : "lg:row-span-2"}>
            <RightSidebar />
          </div>
          <div className={isBottomSidebarCoveringRightSidebar ? "lg:col-span-2" : "lg:col-start-1"}>
            <BottomSidebar
              isCoveringRightSidebar={isBottomSidebarCoveringRightSidebar}
              onCoveringRightSidebarChange={setIsBottomSidebarCoveringRightSidebar}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
