import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
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
 */
export const AgentUndoOptionsPanel = ({
  isOpen,
  position,
  activeIndex,
  onSelect,
}: AgentUndoOptionsPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData = position !== null ? { position, activeIndex } : null

  const options = [
    {
      id: "revert_and_delete",
      label: t("agent.undoOptionRevertAndDelete"),
      desc: t("agent.undoOptionRevertAndDeleteDesc"),
      danger: true,
    },
    {
      id: "delete_only",
      label: t("agent.undoOptionDeleteOnly"),
      desc: t("agent.undoOptionDeleteOnlyDesc"),
      danger: false,
    },
    {
      id: "revert_only",
      label: t("agent.undoOptionRevertOnly"),
      desc: t("agent.undoOptionRevertOnlyDesc"),
      danger: false,
    },
    {
      id: "cancel",
      label: t("agent.cancelUndo"),
      desc: "",
      danger: false,
    },
  ]

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
          {options.map((opt, index) => {
            const isActive = index === displayData.activeIndex
            return (
              <LxCommandPanelItem
                key={opt.id}
                active={isActive}
                activeClassName={
                  opt.danger ? "bg-red-500/20 text-red-200" : "bg-white/8 text-white"
                }
                className="flex h-10 items-center gap-2 px-2"
                idleClassName={
                  opt.danger ? "text-red-300/80 hover:bg-white/5" : "text-white/75 hover:bg-white/5"
                }
                index={index}
                leading={
                  <span
                    className={`flex h-5 w-5 flex-none items-center justify-center rounded-[4px] text-xs font-semibold ${
                      opt.danger ? "bg-red-500/30 text-red-200" : "bg-white/10 text-white/70"
                    }`}
                  >
                    {index + 1}
                  </span>
                }
                onSelect={() => onSelect?.(index)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={`flex shrink-0 items-center text-sm font-medium leading-none ${
                      opt.danger ? "text-red-300" : "text-white"
                    }`}
                  >
                    {opt.label}
                  </span>
                  {opt.desc && (
                    <span className="min-w-0 flex-1 truncate text-xs leading-none text-white/40">
                      {opt.desc}
                    </span>
                  )}
                </span>
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
