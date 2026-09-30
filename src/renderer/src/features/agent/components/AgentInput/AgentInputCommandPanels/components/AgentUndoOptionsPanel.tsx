import type { CSSProperties } from "react"
import { LxCommandPanel } from "@/components/ui/LxCommandPanel"
import { AGENT_UNDO_OPTION_ORDER, AgentUndoOptionsList } from "@/features/agent/components/blocks"
import { useTranslation } from "@/i18n"
import { panelClassName } from "../utils"

export interface AgentUndoOptionsPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  activeIndex: number
  onSelect?: (index: number) => void
}

/**
 * 渲染 /undo 三选一选项面板（参考 Claude rewind）：
 * 回退文件并撤销对话 / 仅撤销对话 / 仅回退文件（保留对话）/ 取消。
 * 选项行与消息列表/执行流删除按钮菜单共用 AgentUndoOptionsList。
 */
export const AgentUndoOptionsPanel = ({
  isOpen,
  position,
  activeIndex,
  onSelect,
}: AgentUndoOptionsPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData = position !== null ? { position, activeIndex } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.undoTitle")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          <div className="px-2.5 py-1.5 text-xs font-medium text-white/50 border-b border-white/10 mb-1">
            {t("agent.undoTitle")}
          </div>
          <AgentUndoOptionsList
            activeIndex={displayData.activeIndex}
            onSelect={(option) => onSelect?.(AGENT_UNDO_OPTION_ORDER.indexOf(option))}
            onCancel={() => onSelect?.(AGENT_UNDO_OPTION_ORDER.length)}
          />
        </>
      )}
    </LxCommandPanel>
  )
}
