import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"

import { LxIconButton } from "@/components/ui/LxIconButton"

/**
 * 左侧栏
 */
export const RightSideBar = (): React.JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true)

  return (
    <aside
      className={`h-full shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-2 transition-[width,min-width,max-width] duration-300 ease-in-out ${
        isCollapsed ? "w-10 min-w-10 max-w-10" : "w-[380px] min-w-[380px] max-w-[380px]"
      }`}
    >
      <div className="relative h-6 w-full">
        <LxIconButton
          className={`absolute top-0 transition-transform duration-300 ease-in-out ${
            isCollapsed ? "left-1/2 -translate-x-1/2" : "right-0 translate-x-0"
          }`}
          aria-label={isCollapsed ? "展开右侧栏" : "折叠右侧栏"}
          title={{ content: isCollapsed ? "展开右侧栏" : "折叠右侧栏", placement: "left" }}
          onClick={() => setIsCollapsed((currentValue) => !currentValue)}
        >
          {isCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </LxIconButton>
      </div>
    </aside>
  )
}
