import { useState } from "react"
import { BottomSideBar } from "@/components/layout/BottomSideBar"
import { HeaderSideBar } from "@/components/layout/HeaderSideBar"
import { PageContent } from "@/components/layout/PageContent"
import { RightSideBar } from "@/components/layout/RightSideBar"
import { LxToastProvider } from "@/components/ui/LxToast"
import { ProjectNavigation } from "@/features/project-navigation"
import { PageRouter } from "@/routes/PageRouter"

/**
 * 渲染应用根节点。
 */
export const App = () => {
  const [isBottomSideBarCoveringRightSideBar, setIsBottomSideBarCoveringRightSideBar] =
    useState<boolean>(true)
  const [isHeaderExpanded, setIsHeaderExpanded] = useState<boolean>(false)
  const [isBottomSideBarExpanded, setIsBottomSideBarExpanded] = useState<boolean>(false)

  const handleHeaderExpandedChange = (isExpanded: boolean): void => {
    setIsHeaderExpanded(isExpanded)
    if (isExpanded) {
      setIsBottomSideBarExpanded(false)
    }
  }

  const handleBottomSideBarExpandedChange = (isExpanded: boolean): void => {
    setIsBottomSideBarExpanded(isExpanded)
    if (isExpanded) {
      setIsHeaderExpanded(false)
    }
  }

  return (
    <LxToastProvider>
      <div className="flex h-screen w-screen flex-col gap-2 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden">
        <ProjectNavigation />
        <div className="flex h-auto min-w-0 flex-1 flex-col overflow-hidden lg:h-full">
          <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[minmax(0,1fr)_auto]">
            <div className="flex min-w-0 flex-col">
              <HeaderSideBar
                isExpanded={isHeaderExpanded}
                onExpandedChange={handleHeaderExpandedChange}
              />
              <PageContent>
                <PageRouter />
              </PageContent>
            </div>
            <div className={isBottomSideBarCoveringRightSideBar ? "" : "lg:row-span-2"}>
              <RightSideBar />
            </div>
            <div
              className={isBottomSideBarCoveringRightSideBar ? "lg:col-span-2" : "lg:col-start-1"}
            >
              <BottomSideBar
                isCoveringRightSideBar={isBottomSideBarCoveringRightSideBar}
                isExpanded={isBottomSideBarExpanded}
                onCoveringRightSideBarChange={setIsBottomSideBarCoveringRightSideBar}
                onExpandedChange={handleBottomSideBarExpandedChange}
              />
            </div>
          </div>
        </div>
      </div>
    </LxToastProvider>
  )
}
