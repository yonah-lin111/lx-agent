import { RotateCcw, Trash2, Undo2 } from "lucide-react"
import { LxNavItem } from "@/components/ui/LxNavItem"
import type { AgentUndoOption } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface AgentUndoOptionsMenuProps {
  onSelect: (option: AgentUndoOption) => void
}

/**
 * 撤销/删除三选一菜单（LxNavItem 行样式，与 /undo 选项一致，无取消行）：
 * 回退文件并撤销对话 / 仅撤销对话 / 仅回退文件（保留对话）。
 */
export const AgentUndoOptionsMenu = ({
  onSelect,
}: AgentUndoOptionsMenuProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div
      className="agent-turn-delete-menu flex min-w-48 flex-col gap-0.5"
      aria-label={t("agent.deleteTurn")}
    >
      <LxNavItem
        level={3}
        size="small"
        className="agent-turn-delete-revert"
        prefix={<RotateCcw className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />}
        label={t("agent.undoOptionRevertAndDelete")}
        onClick={() => onSelect("revert_and_delete")}
      />
      <LxNavItem
        level={3}
        size="small"
        className="agent-turn-delete-keep"
        prefix={<Trash2 className="h-3.5 w-3.5 shrink-0 text-red-400/80" />}
        label={t("agent.undoOptionDeleteOnly")}
        onClick={() => onSelect("delete_only")}
      />
      <LxNavItem
        level={3}
        size="small"
        className="agent-turn-delete-revert-only"
        prefix={<Undo2 className="h-3.5 w-3.5 shrink-0 text-sky-300/80" />}
        label={t("agent.undoOptionRevertOnly")}
        onClick={() => onSelect("revert_only")}
      />
    </div>
  )
}
