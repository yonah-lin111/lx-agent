import { Folder } from "lucide-react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import { useTranslation } from "@/i18n"
import type { AgentInputProjectItem } from "../types"
import { panelClassName } from "../utils"

export interface AgentInputProjectPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  projects: AgentInputProjectItem[]
  activeIndex: number
  onSelect?: (project: AgentInputProjectItem) => void
}

/**
 * 渲染 Agent 输入框的项目选择面板（/project 触发）。
 */
export const AgentInputProjectPanel = ({
  isOpen,
  position,
  projects,
  activeIndex,
  onSelect,
}: AgentInputProjectPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && projects.length > 0 ? { position, activeIndex, projects } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.projectSelect")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.projects.map((project, index) => {
            const isActive = index === displayData.activeIndex
            return (
              <LxCommandPanelItem
                key={project.id || project.path || "desktop"}
                active={isActive}
                className="flex h-11 items-center gap-2 px-2 text-xs"
                index={index}
                leading={
                  <Folder
                    className={`h-3.5 w-3.5 shrink-0 ${
                      project.isDesktop ? "text-violet-400" : "text-sky-400"
                    }`}
                  />
                }
                onSelect={() => onSelect?.(project)}
              >
                <span
                  className={`truncate font-medium ${
                    project.isDesktop ? "text-violet-300" : "text-white"
                  }`}
                >
                  {project.name}
                </span>
                {project.isCurrent && (
                  <LxTag
                    bgClass="bg-emerald-500/20 text-emerald-300"
                    className="pointer-events-none shrink-0"
                    size="small"
                  >
                    current
                  </LxTag>
                )}
                <span className="ml-auto shrink-0 max-w-[50%] truncate text-xs text-white/35">
                  {project.path}
                </span>
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
