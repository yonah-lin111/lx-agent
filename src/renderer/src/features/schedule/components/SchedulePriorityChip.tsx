import type { SchedulePriority } from "@shared/contracts/schedule"
import { SCHEDULE_PRIORITY_COLORS } from "../constants"

// 优先级徽标属性。
export interface SchedulePriorityChipProps {
  priority: SchedulePriority
  // 已完成条目弱化显示。
  completed?: boolean
  // 可访问名称（点击循环切换优先级）。
  label?: string
  onClick?: () => void
}

/**
 * 渲染可点击循环切换的优先级徽标（颜色引用主题 token，已完成时弱化）。
 */
export const SchedulePriorityChip = ({
  priority,
  completed = false,
  label,
  onClick,
}: SchedulePriorityChipProps): React.JSX.Element => {
  const color = completed ? "var(--color-theme-text-subtle)" : SCHEDULE_PRIORITY_COLORS[priority]

  return (
    <button
      type="button"
      aria-label={label}
      className="lx-schedule-priority flex h-[18px] w-[30px] shrink-0 items-center justify-center rounded-[4px] border text-[10px] font-mono font-bold leading-none transition-colors"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
      onClick={onClick}
    >
      {priority}
    </button>
  )
}
