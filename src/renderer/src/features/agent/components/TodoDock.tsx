import type { TodoList } from "@shared/contracts/agent"
import { ListTodo, Minus } from "lucide-react"
import type { CSSProperties } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { isTodoDone, TodoStatusIcon } from "@/features/agent/components/TodoStatusIcon"

// 折叠胶囊配色（实心不透明）：全部完成 → 绿；有进行中 → 黄；其余 → 当前深灰。
const getCapsuleClasses = (todos: TodoList): { bg: string; hoverBg: string; content: string } => {
  const hasInProgress = todos.some((todo) => todo.status === "in_progress")
  const allDone = todos.every((todo) => isTodoDone(todo.status))
  const bg = allDone ? "bg-emerald-400" : hasInProgress ? "bg-amber-400" : "bg-[#303030]"
  const hoverBg = allDone
    ? "hover:bg-emerald-500"
    : hasInProgress
      ? "hover:bg-amber-500"
      : "hover:bg-[#3a3a3a]"
  // 黄/绿背景上 icon 与进度用深色文字保证对比。
  const content = allDone || hasInProgress ? "text-black/70" : "text-white/80"
  return { bg, hoverBg, content }
}

/**
 * 任务清单折叠胶囊：右上角图标栏成员（icon + 完成进度如 1/6），点击展开。
 * 高度与权限折叠 icon 一致（28px）；不负责定位（由 AgentInput 右上角图标栏统一布局）。
 */
export const TodoDockButton = ({
  todos,
  onClick,
}: {
  todos: TodoList
  onClick: () => void
}): React.JSX.Element | null => {
  if (todos.length === 0) return null
  const done = todos.filter((todo) => isTodoDone(todo.status)).length
  const { bg, hoverBg, content } = getCapsuleClasses(todos)

  return (
    <LxIconButton
      shape="circle"
      icon={<ListTodo className={`h-4 w-4 shrink-0 ${content}`} />}
      aria-label="任务清单（点击展开）"
      title={{ content: "展开任务清单", placement: "top" }}
      className={`pointer-events-auto h-7 border border-white/10 px-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${bg}`}
      hoverBgClass={hoverBg}
      hoverTextClass="hover:text-white"
      onClick={onClick}
    >
      <span className={`shrink-0 text-[11px] leading-none ${content}`}>
        {done}/{todos.length}
      </span>
    </LxIconButton>
  )
}

/**
 * 任务清单展开面板：输入框上方固定浮层（AgentInput 计算 position 传入）。
 * 折叠态由右上角图标栏的 TodoDockButton 承载；标题栏参考权限面板（右侧最小化按钮收起）。
 * z-index 低于命令面板/权限面板（z-40），任何状态下不遮挡其他命令面板。
 */
export const TodoDock = ({
  todos,
  position,
  expanded,
  onToggleExpanded,
}: {
  todos: TodoList
  position: CSSProperties | null
  expanded: boolean
  onToggleExpanded: (expanded: boolean) => void
}): React.JSX.Element | null => {
  if (todos.length === 0 || !position || !expanded) return null
  const done = todos.filter((todo) => isTodoDone(todo.status)).length

  return (
    <div
      aria-label="任务清单"
      className="fixed z-40 flex flex-col rounded-[6px] border border-white/10 bg-[#303030] shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
      style={{ ...position, overflow: "hidden" }}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 px-2 pt-1.5 pb-1.5">
        <ListTodo className="h-3.5 w-3.5 shrink-0 text-white/50" />
        <span className="shrink-0 text-[13px] font-medium text-white/90">任务清单</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <span className="text-[12px] text-white/50">
            {done}/{todos.length}
          </span>
          <LxIconButton
            size="small"
            aria-label="收起任务清单"
            title={{ content: "最小化", placement: "top" }}
            onClick={() => onToggleExpanded(false)}
          >
            <Minus className="h-3.5 w-3.5" />
          </LxIconButton>
        </span>
      </div>
      <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto p-1">
        {todos.map((todo, index) => (
          <div
            key={index}
            className="flex w-full items-start gap-2 rounded-[4px] px-2 py-1 text-left transition-colors hover:bg-white/5"
          >
            {/* mt 对齐第一行文字（icon 14px 相对内容行高 20px 垂直居中）。 */}
            <TodoStatusIcon status={todo.status} className="mt-[3px]" />
            <span
              className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-[20px] ${
                isTodoDone(todo.status) ? "text-white/40 line-through" : "text-white/90"
              }`}
            >
              {todo.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
