import type { PermissionRequest } from "@shared/contracts/agent"
import { ChevronUp, ShieldAlert } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { useLayoutEffect, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"

export type PermissionPanelPhase = "select" | "confirm"

export interface PermissionPanelOption {
  key: string
  label: string
  description: string
  tone?: "default" | "allow" | "danger" | "warn"
}

// 选择态：允许 / 允许本次会话 / 拒绝 / 允许全部。
export const PERMISSION_SELECT_OPTIONS: PermissionPanelOption[] = [
  { key: "allow", label: "允许", description: "本次放行该操作", tone: "allow" },
  { key: "session", label: "允许本次会话", description: "本次会话内不再询问同类操作" },
  { key: "deny", label: "拒绝", description: "拒绝该操作，交由模型解释调整", tone: "danger" },
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

// 工具风险文案。
export const permissionRiskText = (toolName: string): string => {
  if (toolName === "bash") return "该操作将在项目目录执行命令，可能产生副作用。"
  if (toolName === "write" || toolName === "edit") return "该操作将修改项目文件。"
  return "该操作将调用外部服务工具。"
}

interface PermissionRequestPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  request: PermissionRequest
  phase: PermissionPanelPhase
  options: PermissionPanelOption[]
  activeIndex: number
  // 折叠态：仅保留标题行，键盘决策降级（Enter/↑↓ 不生效，Esc 仍拒绝）。
  isCollapsed: boolean
  onToggleCollapse: () => void
  onHoverIndex: (index: number) => void
  onSelect: (index: number) => void
}

// 折叠时标题行高度（ShieldAlert + Permission 文案 + 折叠按钮）。
const COLLAPSED_HEIGHT = 36

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
  }, [isOpen, position, activeIndex])

  return panelRef
}

/**
 * 工具权限确认命令面板：输入框上方弹出，替代权限弹窗。
 * 选择态（允许/本次会话/拒绝/允许全部）→ 选中"允许全部"进入确认态（确认/返回）。
 * 键盘由 AgentInput 接管（↑↓/Enter/Esc），本组件负责渲染与鼠标交互。
 * 折叠态：仅一行 Permission 文案（无展开按钮），点击面板展开；宽高均走过渡动画。
 */
export const PermissionRequestPanel = ({
  isOpen,
  position,
  request,
  phase,
  options,
  activeIndex,
  isCollapsed,
  onToggleCollapse,
  onHoverIndex,
  onSelect,
}: PermissionRequestPanelProps): React.JSX.Element | null => {
  const panelRef = useActiveItemScrollIntoView(isOpen, position, activeIndex)
  const contentRef = useRef<HTMLDivElement>(null)
  // 展开态内容高度 / 折叠态内容宽度：宽高过渡复用 HeaderSideBar 动画（duration-300 ease-in-out）。
  const [expandedHeight, setExpandedHeight] = useState(0)
  const [collapsedWidth, setCollapsedWidth] = useState(0)

  // 折叠态测内容宽度、展开态测内容高度；内容变化（确认态切换/新请求）时重测。
  useLayoutEffect(() => {
    if (!isOpen) return
    const el = contentRef.current
    if (!el) return
    if (isCollapsed) {
      setCollapsedWidth(el.getBoundingClientRect().width)
    } else {
      setExpandedHeight(el.scrollHeight)
    }
  }, [isOpen, isCollapsed, phase, options, request])

  if (!isOpen || !position) return null

  // 折叠态：height 收敛标题行、width 收敛内容宽（自适应左对齐）、溢出裁剪；点击面板展开。
  // 展开态：height 锁定内容高度、width 取输入框宽，宽高均参与过渡动画。
  const containerStyle: CSSProperties = isCollapsed
    ? {
        ...position,
        height: COLLAPSED_HEIGHT,
        width: collapsedWidth > 0 ? collapsedWidth : position.width,
        overflow: "hidden",
      }
    : { ...position, height: expandedHeight > 0 ? expandedHeight : undefined }

  return (
    <div
      ref={panelRef}
      aria-label="权限确认"
      className={`${panelClassName} transition-[height,min-height,max-height,width] duration-300 ease-in-out ${
        isCollapsed ? "flex flex-col items-start justify-center cursor-pointer" : ""
      }`}
      role="listbox"
      style={containerStyle}
      onClick={isCollapsed ? onToggleCollapse : undefined}
    >
      <div ref={contentRef} className={isCollapsed ? "w-fit" : undefined}>
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          {isCollapsed ? (
            <span className="shrink-0 text-[13px] font-medium text-white/90">Permission</span>
          ) : (
            <>
              <span className="rounded-[4px] bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-amber-300">
                {request.toolName}
              </span>
              <span className="font-mono text-[11px] text-white/35">{request.mode}</span>
              <LxIconButton
                size="small"
                aria-label="折叠权限确认"
                title={{ content: "折叠", placement: "top" }}
                className="ml-auto"
                onClick={onToggleCollapse}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </LxIconButton>
            </>
          )}
        </div>
        {!isCollapsed && (
          <>
            <p className="max-h-24 break-all overflow-y-auto px-2 py-1 font-mono text-[12px] leading-relaxed text-white/70">
              {request.summary}
            </p>
            <p className="px-2 pb-1.5 text-xs text-white/45">
              {permissionRiskText(request.toolName)}
            </p>
            {phase === "confirm" && (
              <p className="px-2 pb-1.5 text-xs text-amber-300/90">
                允许当前对话全部工具与 MCP 不再询问？
              </p>
            )}
            <div className="my-1 border-t border-white/10" />
            {options.map((option, index) => (
              <div
                key={option.key}
                role="option"
                data-index={index}
                aria-selected={index === activeIndex}
                onMouseEnter={() => onHoverIndex(index)}
                onClick={() => onSelect(index)}
                className={`flex h-11 w-full cursor-pointer items-center gap-2 rounded-[4px] px-2 text-left transition-colors ${toneClass(
                  option.tone,
                  index === activeIndex,
                )}`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0 text-[13px] leading-none">{option.label}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] leading-none opacity-60">
                    {option.description}
                  </span>
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
