import type { TodoItem, TodoList } from "@shared/contracts/agent"
import { ListTodo, Minus, Square, SquareCheckBig } from "lucide-react"
import type { CSSProperties } from "react"
import { useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"

// 状态 icon：方形样式（对齐 checkbox 视觉）——completed=绿勾方 / in_progress=amber 实心方 / pending=空心方。
// cancelled 按完成语义展示（灰勾方，区别于 completed 的绿色）。
const TodoStatusIcon = ({
  status,
  className = "",
}: {
  status: TodoItem["status"]
  className?: string
}): React.JSX.Element => {
  if (status === "completed") {
    return <SquareCheckBig className={`h-3.5 w-3.5 shrink-0 ${className} text-emerald-400/80`} />
  }
  if (status === "in_progress") {
    return (
      <span
        aria-hidden="true"
        className={`h-3.5 w-3.5 shrink-0 rounded-[2px] bg-amber-400/80 ${className}`}
      />
    )
  }
  if (status === "cancelled") {
    return <SquareCheckBig className={`h-3.5 w-3.5 shrink-0 ${className} text-white/30`} />
  }
  return <Square className={`h-3.5 w-3.5 shrink-0 ${className} text-white/30`} />
}

// 已完成/已取消项内容划线（cancelled 按完成语义展示）。
const isDone = (status: TodoItem["status"]): boolean =>
  status === "completed" || status === "cancelled"

/**
 * 任务清单 dock：输入框上方固定浮层（AgentInput 计算 position 传入）。
 * 折叠态 = 左侧小块（高度与权限按钮折叠态一致、无边框），点击展开为完整清单
 * （宽度占满输入框，标题栏参考权限面板：最小化按钮收起）。
 * z-index 低于命令面板/权限面板（z-50），任何状态下不遮挡其他命令面板。
 */
export const TodoDock = ({
  todos,
  position,
}: {
  todos: TodoList
  position: CSSProperties | null
}): React.JSX.Element | null => {
  const [expanded, setExpanded] = useState(false)
  if (todos.length === 0 || !position) return null

  const done = todos.filter((todo) => isDone(todo.status)).length
  // 胶囊背景色（实心不透明）：全部完成 → 绿；有进行中 → 黄；其余 → 当前深灰。
  const hasInProgress = todos.some((todo) => todo.status === "in_progress")
  const allDone = todos.length > 0 && todos.every((todo) => isDone(todo.status))
  const capsuleBgClass = allDone
    ? "bg-emerald-400"
    : hasInProgress
      ? "bg-amber-400"
      : "bg-[#303030]"
  const capsuleHoverBgClass = allDone
    ? "hover:bg-emerald-500"
    : hasInProgress
      ? "hover:bg-amber-500"
      : "hover:bg-[#3a3a3a]"
  // 黄/绿背景上 icon 与进度用深色文字保证对比。
  const capsuleContentClass = allDone || hasInProgress ? "text-black/70" : "text-white/80"

  // 折叠态：椭圆胶囊按钮（icon + 完成进度如 1/6 内置），高度与权限折叠态 icon 一致（28px）。
  // 定位在权限折叠 icon 的左侧（权限 icon 右对齐输入框，胶囊右缘 = 权限 icon 左缘）。
  if (!expanded) {
    const capsuleRight =
      typeof position.left === "number" && typeof position.width === "number"
        ? window.innerWidth - position.left - position.width + 42
        : 8
    return (
      <LxIconButton
        shape="circle"
        icon={<ListTodo className={`h-4 w-4 shrink-0 ${capsuleContentClass}`} />}
        aria-label="任务清单（点击展开）"
        title={{ content: "展开任务清单", placement: "top" }}
        className={`fixed z-40 border border-white/10 px-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${capsuleBgClass}`}
        hoverBgClass={capsuleHoverBgClass}
        hoverTextClass="hover:text-white"
        onClick={() => setExpanded(true)}
        style={{
          bottom: position.bottom,
          right: capsuleRight,
          height: 28,
          overflow: "hidden",
        }}
      >
        <span className={`shrink-0 text-[11px] leading-none ${capsuleContentClass}`}>
          {done}/{todos.length}
        </span>
      </LxIconButton>
    )
  }

  // 展开态：宽度占满输入框（position.width）；标题栏参考权限面板（右侧最小化按钮）。
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
            onClick={() => setExpanded(false)}
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
                isDone(todo.status) ? "text-white/40 line-through" : "text-white/90"
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
