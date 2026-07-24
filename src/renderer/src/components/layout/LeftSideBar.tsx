import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"

import { IconButton } from "@/components/ui/IconButton"

/**
 * 页面左侧栏布局容器。
 */
export const LeftSideBar = (): React.JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)

  return (
    <aside
      className={`h-40 shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-2 transition-all duration-300 ease-in-out lg:h-full ${
        isCollapsed
          ? "w-16 min-w-16 max-w-16"
          : "w-full min-w-full max-w-full lg:w-56 lg:min-w-56 lg:max-w-56"
      }`}
    >
      <div className="relative h-6 w-full">
        <IconButton
          className={`absolute left-0 top-0 transition-transform duration-300 ease-in-out ${
            isCollapsed ? "translate-x-3" : "translate-x-0"
          }`}
          aria-label={isCollapsed ? "展开左侧栏" : "折叠左侧栏"}
          title={{ content: isCollapsed ? "展开左侧栏" : "折叠左侧栏", placement: "right" }}
          onClick={() => setIsCollapsed((currentValue) => !currentValue)}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </IconButton>
      </div>
    </aside>
  )
}
