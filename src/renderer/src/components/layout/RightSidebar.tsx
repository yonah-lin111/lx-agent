import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"

import { IconButton } from "@/components/ui/IconButton"

/**
 * 左侧栏
 */
export const RightSidebar = (): React.JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true)

  return (
    <aside
      className={`h-full shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-2 transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-16 min-w-16 max-w-16" : "min-w-[380px]"
      }`}
    >
      <div className="relative h-6 w-full">
        <IconButton
          className={`absolute top-0 transition-[left,transform] duration-300 ease-in-out ${
            isCollapsed ? "left-1/2 -translate-x-1/2" : "left-[calc(100%_-_1.5rem)] translate-x-0"
          }`}
          aria-label={isCollapsed ? "展开右侧栏" : "折叠右侧栏"}
          title={{ content: isCollapsed ? "展开右侧栏" : "折叠右侧栏", placement: "left" }}
          onClick={() => setIsCollapsed((currentValue) => !currentValue)}
        >
          {isCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </IconButton>
      </div>
    </aside>
  )
}
