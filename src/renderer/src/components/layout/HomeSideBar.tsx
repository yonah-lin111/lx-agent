import { LeftSideBar } from "@/components/layout/LeftSideBar"

/**
 * 渲染主页侧边栏空壳。
 */
export const HomeSideBar = (): React.JSX.Element => {
  return (
    <LeftSideBar>
      <div className="flex h-full items-center justify-center text-sm text-white/60">
        主页侧边栏
      </div>
    </LeftSideBar>
  )
}
