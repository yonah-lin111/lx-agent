import type { PermissionRequest } from "@shared/contracts/agent"
import { Minus, ShieldAlert } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { useLayoutEffect, useRef } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"

export type PermissionPanelPhase = "select" | "confirm"

export interface PermissionPanelOption {
  key: string
  label: string
  description: string
  tone?: "default" | "allow" | "danger" | "warn"
}

// 选择态：允许 / 允许本次会话 / 永久允许 / 拒绝 / 永久拒绝 / 允许全部。
export const PERMISSION_SELECT_OPTIONS: PermissionPanelOption[] = [
  { key: "allow", label: "允许", description: "本次放行该操作", tone: "allow" },
  { key: "session", label: "允许本次会话", description: "本次会话内不再询问同类操作" },
  {
    key: "permanentAllow",
    label: "永久允许",
    description: "写回配置，相同操作不再询问",
    tone: "allow",
  },
  { key: "deny", label: "拒绝", description: "拒绝该操作，交由模型解释调整", tone: "danger" },
  {
    key: "permanentDeny",
    label: "永久拒绝",
    description: "写回配置，相同操作直接拒绝",
    tone: "danger",
  },
  { key: "allowAll", label: "允许全部", description: "允许当前对话全部工具与 MCP", tone: "warn" },
]

// 确认态：确认允许全部 / 返回（默认停在"返回"）。
export const PERMISSION_CONFIRM_OPTIONS: PermissionPanelOption[] = [
  {
    key: "confirmAllowAll",
    label: "确认允许全部",
    description: "对当前对话全部工具与 MCP 不再询问",
    tone: "danger",
  },
  { key: "back", label: "返回", description: "返回选择", tone: "default" },
]

interface PermissionRequestPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  request: PermissionRequest
  phase: PermissionPanelPhase
  options: PermissionPanelOption[]
  activeIndex: number
  // 折叠态：面板不渲染，仅一行权限图标浮层（右对齐）。
  isCollapsed: boolean
  // 键盘导航版本号：仅上下键变化时触发选项滚动。
  keyboardNavigationVersion?: number
  onToggleCollapse: () => void
  onHoverIndex: (index: number) => void
  onSelect: (index: number) => void
}

// 折叠态浮层高度（与底栏图标按钮 medium 一致）。
const COLLAPSED_HEIGHT = 28

// 面板容器：与命令面板同风格，但允许鼠标交互（pointer-events-auto）。
const panelClassName =
  "scrollbar-hidden fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)]"

// 选项 tone 配色（active 高亮态 / 非激活态）。
const toneClass = (tone: PermissionPanelOption["tone"], active: boolean): string => {
  if (tone === "allow") return active ? "bg-emerald-500/20 text-emerald-300" : "text-emerald-300/70"
  if (tone === "danger") return active ? "bg-rose-500/20 text-rose-300" : "text-rose-300/70"
  if (tone === "warn") return active ? "bg-amber-500/20 text-amber-300" : "text-amber-300/70"
  return active ? "bg-white/8 text-white" : "text-white/75"
}

/**
 * 激活项与面板边缘保持间距，避免上下键移动时被裁切。
 */
const useActiveItemScrollIntoView = (
  isOpen: boolean,
  position: CSSProperties | null,
  activeIndex: number,
  scrollTrigger = activeIndex,
): React.RefObject<HTMLDivElement | null> => {
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!isOpen || !position) return
    const container = panelRef.current
    if (!container) return

    const activeElement = container.querySelector(
      `[data-index="${activeIndex}"]`,
    ) as HTMLElement | null
    if (!activeElement) return

    const scrollPadding = 4
    const containerRect = container.getBoundingClientRect()
    const activeRect = activeElement.getBoundingClientRect()

    if (activeRect.top < containerRect.top + scrollPadding) {
      container.scrollTop -= containerRect.top + scrollPadding - activeRect.top
    } else if (activeRect.bottom > containerRect.bottom - scrollPadding) {
      container.scrollTop += activeRect.bottom - (containerRect.bottom - scrollPadding)
    }
  }, [isOpen, position, scrollTrigger])

  return panelRef
}

/**
 * 工具权限确认命令面板：输入框上方弹出，替代权限弹窗。
 * 选择态（允许/本次会话/永久允许/拒绝/永久拒绝/允许全部）→ 选中"允许全部"进入确认态（确认/返回）。
 * 永久允许/永久拒绝直接发送（写回配置，无需二次确认，区别于 allowAll）。
 * 键盘由 AgentInput 接管（↑↓/Enter/Esc），本组件负责渲染与鼠标交互。
 * 折叠态：仅一行权限图标浮层（右对齐，后续可继续追加图标），点击展开；无动画直接切换。
 */
export const PermissionRequestPanel = ({
  isOpen,
  position,
  request,
  phase,
  options,
  activeIndex,
  isCollapsed,
  keyboardNavigationVersion = 0,
  onToggleCollapse,
  onHoverIndex,
  onSelect,
}: PermissionRequestPanelProps): React.JSX.Element | null => {
  // 选项区滚动定位（参考 / @ 命令面板）：上下键切换时高亮项始终可见。
  const panelRef = useActiveItemScrollIntoView(
    isOpen,
    position,
    activeIndex,
    keyboardNavigationVersion,
  )

  if (!isOpen || !position) return null

  // 折叠态：透明浮层（宽度沿用输入框），图标右对齐；容器不拦截指针，仅图标可点。
  if (isCollapsed) {
    return (
      <div
        aria-label="权限确认（已折叠）"
        className="pointer-events-none fixed z-50 flex items-center justify-end px-2"
        style={{ ...position, height: COLLAPSED_HEIGHT, overflow: "hidden" }}
      >
        <LxIconButton
          shape="circle"
          aria-label="展开权限确认"
          title={{ content: "展开权限面板", placement: "top" }}
          className="pointer-events-auto border border-white/10 bg-[#303030] !text-amber-300"
          hoverBgClass="hover:bg-[#3a3a3a]"
          hoverTextClass="hover:text-amber-300"
          onClick={onToggleCollapse}
        >
          <ShieldAlert className="h-4 w-4" />
        </LxIconButton>
      </div>
    )
  }

  // 高度由内容决定，maxHeight 沿用 position（视口空间动态计算），顶部固定、仅选项区滚动。
  const containerStyle: CSSProperties = { ...position, overflow: "hidden" }

  return (
    <div
      aria-label="权限确认"
      className={`${panelClassName} flex flex-col`}
      role="listbox"
      style={containerStyle}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 顶部固定：标题 + 工具信息，不随选项滚动。 */}
        <div className="shrink-0 border-b border-white/10">
          <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="shrink-0 text-[13px] font-medium text-white/90">Permission</span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              <span className="text-[12px] text-white/50">{request.mode}</span>
              <LxIconButton
                size="small"
                aria-label="最小化权限确认"
                title={{ content: "最小化", placement: "top" }}
                onClick={onToggleCollapse}
              >
                <Minus className="h-3.5 w-3.5" />
              </LxIconButton>
            </span>
          </div>
          <div className="px-2 pb-1.5">
            <span className="block w-fit max-w-full truncate rounded-[4px] bg-amber-300/10 px-1.5 py-0.5 font-mono text-[12px] text-amber-300">
              {request.toolName}
            </span>
          </div>
          {phase === "confirm" && (
            <p className="px-2 pb-1.5 text-xs text-amber-300/90">
              允许当前对话全部工具与 MCP 不再询问？
            </p>
          )}
        </div>
        {/* 选项区：仅此区域可滚动；ref 用于上下键滚动定位（参考 / @ 命令面板）。
            py-1 提供上下内边距，与 todo 清单区一致（不贴标题栏边框）。 */}
        <div ref={panelRef} className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto py-1">
          {options.map((option, index) => (
            <div
              key={option.key}
              role="option"
              data-index={index}
              aria-selected={index === activeIndex}
              onMouseEnter={() => onHoverIndex(index)}
              onClick={() => onSelect(index)}
              className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-[4px] px-2 text-left transition-colors ${toneClass(
                option.tone,
                index === activeIndex,
              )}`}
            >
              <span className="min-w-0 max-w-[45%] truncate text-[13px] font-medium leading-none">
                {option.label}
              </span>
              <span className="ml-auto min-w-0 max-w-[55%] truncate text-[12px] leading-none opacity-60">
                {option.description}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
