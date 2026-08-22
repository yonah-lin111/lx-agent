import type { TodoItem } from "@shared/contracts/agent"
import { Square, SquareCheckBig } from "lucide-react"

// 状态 icon：方形样式（对齐 checkbox 视觉）——completed=勾方 / in_progress=实心方 / pending=空心方，
// 统一橙色系（对齐 AgentTodoCallBlock 标题色 text-orange-300）。
// cancelled 按完成语义展示（低透明度勾方，区别于 completed 的高亮橙色）。
export const TodoStatusIcon = ({
  status,
  className = "",
}: {
  status: TodoItem["status"]
  className?: string
}): React.JSX.Element => {
  if (status === "completed") {
    return <SquareCheckBig className={`h-3.5 w-3.5 shrink-0 ${className} text-orange-300`} />
  }
  if (status === "in_progress") {
    return (
      <span
        aria-hidden="true"
        className={`h-3.5 w-3.5 shrink-0 rounded-[2px] bg-orange-300 ${className}`}
      />
    )
  }
  if (status === "cancelled") {
    return <SquareCheckBig className={`h-3.5 w-3.5 shrink-0 ${className} text-orange-300/30`} />
  }
  return <Square className={`h-3.5 w-3.5 shrink-0 ${className} text-orange-300/30`} />
}

// 已完成/已取消项内容划线（cancelled 按完成语义展示）。
export const isTodoDone = (status: TodoItem["status"]): boolean =>
  status === "completed" || status === "cancelled"
