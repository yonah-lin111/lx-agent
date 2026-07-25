import { LeftSideBar } from "@/components/layout/LeftSideBar"

/**
 * 渲染设置页面专属左侧栏。
 */
export const SettingsLeftSideBar = (): React.JSX.Element => {
  return (
    <LeftSideBar>
      <div className="flex h-full items-center justify-center text-sm text-white/60">
        设置侧边栏
      </div>
    </LeftSideBar>
  )
}
