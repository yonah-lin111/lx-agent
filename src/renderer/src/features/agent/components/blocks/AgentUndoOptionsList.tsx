import { LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import type { AgentUndoOption } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

// 撤销/删除选项顺序（/undo 面板键盘下标与菜单 data-option 共用）。
export const AGENT_UNDO_OPTION_ORDER: AgentUndoOption[] = [
  "revert_and_delete",
  "delete_only",
  "revert_only",
]

export interface AgentUndoOptionsListProps {
  // 键盘高亮的选项下标（-1 表示无）。
  activeIndex?: number
  onSelect: (option: AgentUndoOption) => void
  onCancel: () => void
}

/**
 * 撤销/删除三选一选项列表：回退文件并撤销对话 / 仅撤销对话 / 仅回退文件（保留对话）/ 取消。
 * 供 /undo 命令面板与消息列表、执行流的删除按钮菜单共用，三个选项始终全部展示。
 */
export const AgentUndoOptionsList = ({
  activeIndex = -1,
  onSelect,
  onCancel,
}: AgentUndoOptionsListProps): React.JSX.Element => {
  const { t } = useTranslation()
  const options: {
    value: AgentUndoOption | "cancel"
    label: string
    desc: string
    danger: boolean
  }[] = [
    {
      value: "revert_and_delete",
      label: t("agent.undoOptionRevertAndDelete"),
      desc: t("agent.undoOptionRevertAndDeleteDesc"),
      danger: true,
    },
    {
      value: "delete_only",
      label: t("agent.undoOptionDeleteOnly"),
      desc: t("agent.undoOptionDeleteOnlyDesc"),
      danger: false,
    },
    {
      value: "revert_only",
      label: t("agent.undoOptionRevertOnly"),
      desc: t("agent.undoOptionRevertOnlyDesc"),
      danger: false,
    },
    {
      value: "cancel",
      label: t("agent.cancelUndo"),
      desc: "",
      danger: false,
    },
  ]

  return (
    <>
      {options.map((opt, index) => (
        <LxCommandPanelItem
          key={opt.value}
          active={index === activeIndex}
          activeClassName={opt.danger ? "bg-red-500/20 text-red-200" : "bg-white/8 text-white"}
          className="agent-undo-option flex h-10 items-center gap-2 px-2"
          idleClassName={
            opt.danger ? "text-red-300/80 hover:bg-white/5" : "text-white/75 hover:bg-white/5"
          }
          index={index}
          data-option={opt.value}
          leading={
            <span
              className={`flex h-5 w-5 flex-none items-center justify-center rounded-[4px] text-xs font-semibold ${
                opt.danger ? "bg-red-500/30 text-red-200" : "bg-white/10 text-white/70"
              }`}
            >
              {index + 1}
            </span>
          }
          onSelect={() => {
            if (opt.value === "cancel") {
              onCancel()
              return
            }
            onSelect(opt.value)
          }}
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
      ))}
    </>
  )
}
