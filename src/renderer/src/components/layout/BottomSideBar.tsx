import { ChevronDown, ChevronsLeftRight, ChevronsRightLeft, ChevronUp } from "lucide-react"
import type React from "react"
import { useLocation } from "react-router-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { ProjectReferencedFolderTags } from "@/features/project"
import { GhosttyTerminalView } from "@/features/terminal"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

// 页面底边栏属性。
interface BottomSideBarProps {
  children?: React.ReactNode
  isCoveringRightSideBar: boolean
  isExpanded: boolean
  onCoveringRightSideBarChange: (isCoveringRightSideBar: boolean) => void
  onExpandedChange: (isExpanded: boolean) => void
}

/**
 * 页面底边栏布局容器：展开时上方为 Ghostty 终端，下方为文件夹引用与控制栏。
 */
export const BottomSideBar = ({
  children,
  isCoveringRightSideBar,
  isExpanded,
  onCoveringRightSideBarChange,
  onExpandedChange,
}: BottomSideBarProps): React.JSX.Element => {
  const { pathname } = useLocation()
  const isProjectPage = pathname === PAGE_ROUTES.project

  return (
    <aside
      className={`w-full shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-2 transition-[width,height,min-height,max-height] duration-300 ease-in-out ${
        isExpanded ? "h-[300px] min-h-[300px] max-h-[300px]" : "h-[40px] min-h-[40px] max-h-[40px]"
      }`}
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        {/* 展开区域：Ghostty 多标签终端系统 */}
        <div className={`min-h-0 flex-1 overflow-hidden mb-1.5 ${isExpanded ? "block" : "hidden"}`}>
          <GhosttyTerminalView isExpanded={isExpanded} />
        </div>

        {/* 底部固定栏：文件夹引用标签与折叠/展开操作 */}
        <div className="relative h-[24px] shrink-0">
          {isProjectPage && <ProjectReferencedFolderTags isExpanded={isExpanded} />}
          {children}
          <div className="absolute right-0 bottom-0 flex gap-1">
            <LxIconButton
              aria-label={
                isCoveringRightSideBar ? "底边栏不覆盖右侧栏宽度" : "底边栏覆盖右侧栏宽度"
              }
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
      </div>
    </aside>
  )
}
