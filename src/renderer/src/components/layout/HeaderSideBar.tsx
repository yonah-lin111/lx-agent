/**
 * 渲染页面顶部栏。
 */
import { ChevronDown, ChevronUp } from "lucide-react"

import { LxIconButton } from "@/components/ui/LxIconButton"

interface HeaderSideBarProps {
  isExpanded: boolean
  onExpandedChange: (isExpanded: boolean) => void
}

export const HeaderSideBar = ({
  isExpanded,
  onExpandedChange,
}: HeaderSideBarProps): React.JSX.Element => (
  <header
    className={`mb-2 shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-2 transition-[height,min-height,max-height] duration-300 ease-in-out ${
      isExpanded ? "h-[300px] min-h-[300px] max-h-[300px]" : "h-[40px] min-h-[40px] max-h-[40px]"
    }`}
  >
    <div className="relative h-full w-full">
      <div
        className={`absolute right-0 top-0 flex transition-transform duration-300 ease-in-out ${
          isExpanded ? "translate-y-0" : "-translate-y-0.5"
        }`}
      >
        <LxIconButton
          aria-label={isExpanded ? "折叠顶部栏" : "展开顶部栏"}
          title={{ content: isExpanded ? "折叠顶部栏" : "展开顶部栏", placement: "bottom" }}
          onClick={() => onExpandedChange(!isExpanded)}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </LxIconButton>
      </div>
    </div>
  </header>
)
