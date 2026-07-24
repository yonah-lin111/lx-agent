import { ChevronDown, ChevronsLeftRight, ChevronsRightLeft, ChevronUp } from "lucide-react"
import { LxIconButton } from "@/components/ui/LxIconButton"

// 页面底边栏属性。
interface BottomSideBarProps {
  isCoveringRightSideBar: boolean
  isExpanded: boolean
  onCoveringRightSideBarChange: (isCoveringRightSideBar: boolean) => void
  onExpandedChange: (isExpanded: boolean) => void
}

/**
 * 页面底边栏布局容器。
 */
export const BottomSideBar = ({
  isCoveringRightSideBar,
  isExpanded,
  onCoveringRightSideBarChange,
  onExpandedChange,
}: BottomSideBarProps): React.JSX.Element => {
  return (
    <aside
      className={`w-full shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-2 transition-[width,height,min-height,max-height] duration-300 ease-in-out ${
        isExpanded ? "h-[300px] min-h-[300px] max-h-[300px]" : "h-[40px] min-h-[40px] max-h-[40px]"
      }`}
    >
      <div className="relative h-full w-full">
        <div
          className={`absolute right-0 top-0 flex gap-1 transition-transform duration-300 ease-in-out ${
            isExpanded ? "translate-y-0" : "-translate-y-0.5"
          }`}
        >
          <LxIconButton
            aria-label={isCoveringRightSideBar ? "底边栏不覆盖右侧栏宽度" : "底边栏覆盖右侧栏宽度"}
            title={{
              content: isCoveringRightSideBar ? "底边栏不覆盖右侧栏宽度" : "底边栏覆盖右侧栏宽度",
              placement: "top",
            }}
            onClick={() => onCoveringRightSideBarChange(!isCoveringRightSideBar)}
          >
            {isCoveringRightSideBar ? (
              <ChevronsRightLeft className="h-4 w-4" />
            ) : (
              <ChevronsLeftRight className="h-4 w-4" />
            )}
          </LxIconButton>
          <LxIconButton
            aria-label={isExpanded ? "折叠底边栏" : "展开底边栏"}
            title={{ content: isExpanded ? "折叠底边栏" : "展开底边栏", placement: "top" }}
            onClick={() => onExpandedChange(!isExpanded)}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </LxIconButton>
        </div>
      </div>
    </aside>
  )
}
