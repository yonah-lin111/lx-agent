import { Cpu } from "lucide-react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { useTranslation } from "@/i18n"
import type { AgentInputModel } from "../types"
import { panelClassName } from "../utils"

interface AgentInputModelPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  models: AgentInputModel[]
  activeIndex: number
  onSelect?: (model: AgentInputModel) => void
}

/**
 * 渲染 Agent 输入框的模型选择面板。
 */
export const AgentInputModelPanel = ({
  isOpen,
  position,
  models,
  activeIndex,
  onSelect,
}: AgentInputModelPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && models.length > 0 ? { position, activeIndex, models } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.modelSelect")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.models.map((model, index) => (
            <LxCommandPanelItem
              key={model.id}
              active={index === displayData.activeIndex}
              className="flex h-11 items-center gap-3 px-2 text-xs"
              index={index}
              leading={<Cpu className="h-3.5 w-3.5 shrink-0 text-teal-300/60" />}
              onSelect={() => onSelect?.(model)}
            >
              <span className="truncate font-medium">{model.label}</span>
              <span className="ml-auto shrink-0 text-white/35">{model.provider}</span>
            </LxCommandPanelItem>
          ))}
        </>
      )}
    </LxCommandPanel>
  )
}
