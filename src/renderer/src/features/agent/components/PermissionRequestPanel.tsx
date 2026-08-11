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

// 折叠时标题行高度（ShieldAlert + Permission 文案）。
const COLLAPSED_HEIGHT = 36
// 容器 p-1 的左右 padding（4px × 2）：折叠态宽度需补偿容器自身 padding，避免内层被裁、左右留白不对称。
const PANEL_PADDING_X = 8
// 展开态固定高度：选择态完整内容（顶部信息 + 4 选项），切换确认态/摘要变化时面板高度不变。
const EXPANDED_HEIGHT = 320

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
  // 选项区滚动定位（参考 / @ 命令面板）：上下键切换时高亮项始终可见。
  const panelRef = useActiveItemScrollIntoView(isOpen, position, activeIndex)
  const contentRef = useRef<HTMLDivElement>(null)
  // 折叠态内容宽度：折叠时测量供 width 过渡；展开态高度固定（EXPANDED_HEIGHT）。
  const [collapsedWidth, setCollapsedWidth] = useState(0)

  // 折叠态测内容宽度；内容变化（确认态切换/新请求）时重测。
  useLayoutEffect(() => {
    if (!isOpen || !isCollapsed) return
    const el = contentRef.current
    if (el) setCollapsedWidth(el.getBoundingClientRect().width)
  }, [isOpen, isCollapsed, phase, options, request])

  if (!isOpen || !position) return null

  // 折叠态：height 收敛标题行、width 收敛内容宽（含容器 padding，保持左右留白对称）左对齐；点击面板展开。
  // 展开态：height 固定、width 取输入框宽；容器不整体滚动，顶部固定、仅选项区滚动。
  const containerStyle: CSSProperties = isCollapsed
    ? {
        ...position,
        height: COLLAPSED_HEIGHT,
        width: collapsedWidth > 0 ? collapsedWidth + PANEL_PADDING_X : position.width,
        overflow: "hidden",
      }
    : { ...position, height: EXPANDED_HEIGHT, overflow: "hidden" }

  return (
    <div
      aria-label="权限确认"
      className={`${panelClassName} transition-[height,min-height,max-height,width] duration-300 ease-in-out ${
        isCollapsed ? "flex flex-col items-start justify-center cursor-pointer" : "flex flex-col"
      }`}
      role="listbox"
      style={containerStyle}
      onClick={isCollapsed ? onToggleCollapse : undefined}
    >
      <div
        ref={contentRef}
        className={isCollapsed ? "w-fit" : "flex min-h-0 flex-1 flex-col overflow-hidden"}
      >
        {isCollapsed ? (
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="shrink-0 text-[13px] font-medium text-amber-300">Permission</span>
          </div>
        ) : (
          <>
            {/* 顶部固定：工具信息 + 摘要（最多 3 行）+ 风险提示，不随选项滚动。 */}
            <div className="shrink-0">
              <div className="flex items-center gap-1.5 px-2 pt-1.5">
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
              </div>
              <p className="break-all px-2 py-1 font-mono text-[12px] leading-relaxed text-white/70 line-clamp-3">
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
            </div>
            {/* 选项区：仅此区域可滚动；ref 用于上下键滚动定位（参考 / @ 命令面板）。 */}
            <div ref={panelRef} className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto">
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
            </div>
          </>
        )}
      </div>
    </div>
  )
}
