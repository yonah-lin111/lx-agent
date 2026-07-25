import { useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { BottomSideBar } from "@/components/layout/BottomSideBar"
import { HeaderSideBar } from "@/components/layout/HeaderSideBar"
import { HomeSideBar } from "@/components/layout/HomeSideBar"
import { PageContent } from "@/components/layout/PageContent"
import { RightSideBar } from "@/components/layout/RightSideBar"
import { SettingsSideBar } from "@/components/layout/SettingsSideBar"
import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { LxToastProvider } from "@/components/ui/LxToast"
import { ProjectNavigation } from "@/features/project-navigation"
import { PAGE_ROUTES } from "@/lib/pageRoutes"
import { PageRouter } from "@/routes/PageRouter"

/**
 * 渲染应用根节点。
 */
export const App = () => {
  const { pathname } = useLocation()
  const [isPageLoading, setIsPageLoading] = useState<boolean>(true)
  const [isBottomSideBarCoveringRightSideBar, setIsBottomSideBarCoveringRightSideBar] =
    useState<boolean>(true)
  const [isHeaderExpanded, setIsHeaderExpanded] = useState<boolean>(false)
  const [isBottomSideBarExpanded, setIsBottomSideBarExpanded] = useState<boolean>(false)

  // 路由切换时显示统一的页面加载过渡，并保证最短展示时间。
  useEffect(() => {
    setIsPageLoading(true)
    const timer = window.setTimeout(() => setIsPageLoading(false), 300)
    return () => window.clearTimeout(timer)
  }, [pathname])

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

  const renderLeftSideBar = (): React.JSX.Element => {
    if (pathname === PAGE_ROUTES.home) return <HomeSideBar />
    if (pathname === PAGE_ROUTES.settings) return <SettingsSideBar />
    return <ProjectNavigation />
  }

  return (
    <LxToastProvider>
      <div className="flex h-screen w-screen flex-col gap-2 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden">
        {renderLeftSideBar()}
        <div className="flex h-auto min-w-0 flex-1 flex-col overflow-hidden lg:h-full">
          <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[minmax(0,1fr)_auto]">
            <div className="flex min-w-0 flex-col">
              <HeaderSideBar
                isExpanded={isHeaderExpanded}
                onExpandedChange={handleHeaderExpandedChange}
              />
              <PageContent>
                <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
                  <PageRouter />
                  <LxLoadingOverlay isLoading={isPageLoading} text="Loading page..." />
                </div>
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
