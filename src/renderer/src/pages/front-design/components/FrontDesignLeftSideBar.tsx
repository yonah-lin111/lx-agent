import type React from "react"

export interface FrontDesignLeftSideBarProps {
  isCollapsed?: boolean
}

/**
 * 渲染前端设计页面专属左侧栏内容（当前为空占位）。
 */
export const FrontDesignLeftSideBar = ({
  isCollapsed = false,
}: FrontDesignLeftSideBarProps): React.JSX.Element => {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3">
      <div className="flex h-7 shrink-0 items-center justify-end px-1" />
      <div className="min-h-0 flex-1 px-2 text-xs text-white/30">
        {!isCollapsed && <span />}
      </div>
    </div>
  )
}
