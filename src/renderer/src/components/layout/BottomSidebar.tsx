import { ChevronDown, ChevronUp, PanelBottom, PanelBottomDashed } from "lucide-react"
import { useState } from "react"

import { IconButton } from "@/components/ui/IconButton"

// 页面底边栏属性。
interface BottomSidebarProps {
  isCoveringRightSidebar: boolean
  onCoveringRightSidebarChange: (isCoveringRightSidebar: boolean) => void
}

/**
 * 页面底边栏布局容器。
 */
export const BottomSidebar = ({
  isCoveringRightSidebar,
  onCoveringRightSidebarChange,
}: BottomSidebarProps): React.JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true)

  return (
    <aside
      className={`w-full shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-2 transition-[width,height,min-height,max-height] duration-300 ease-in-out ${
        isCollapsed ? "h-[40px] min-h-[40px] max-h-[40px]" : "h-[300px] min-h-[300px] max-h-[300px]"
      }`}
    >
      <div className="relative h-full w-full">
        <div
          className={`absolute right-0 flex gap-1 transition-[top,transform] duration-300 ease-in-out ${
            isCollapsed ? "top-1/2 -translate-y-1/2" : "top-0 translate-y-0"
          }`}
        >
          <IconButton
            aria-label={isCoveringRightSidebar ? "底边栏覆盖右侧栏宽度" : "底边栏不覆盖右侧栏宽度"}
            title={{
              content: isCoveringRightSidebar ? "底边栏覆盖右侧栏宽度" : "底边栏不覆盖右侧栏宽度",
              placement: "top",
            }}
            onClick={() => onCoveringRightSidebarChange(!isCoveringRightSidebar)}
          >
            {isCoveringRightSidebar ? (
              <PanelBottom className="h-4 w-4" />
            ) : (
              <PanelBottomDashed className="h-4 w-4" />
            )}
          </IconButton>
          <IconButton
            aria-label={isCollapsed ? "展开底边栏" : "折叠底边栏"}
            title={{ content: isCollapsed ? "展开底边栏" : "折叠底边栏", placement: "top" }}
            onClick={() => setIsCollapsed((currentValue) => !currentValue)}
          >
            {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </IconButton>
        </div>
      </div>
    </aside>
  )
}
