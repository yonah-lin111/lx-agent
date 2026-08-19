import type { PermissionRequest } from "@shared/contracts/agent"
import { ShieldAlert } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"

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

// 选项 tone 配色（active 高亮态 / 非激活态）。
const toneClass = (tone: PermissionPanelOption["tone"], active: boolean): string => {
  if (tone === "allow") return active ? "bg-emerald-500/20 text-emerald-300" : "text-emerald-300/70"
  if (tone === "danger") return active ? "bg-rose-500/20 text-rose-300" : "text-rose-300/70"
  if (tone === "warn") return active ? "bg-amber-500/20 text-amber-300" : "text-amber-300/70"
  return active ? "bg-white/8 text-white" : "text-white/75"
}

interface PermissionStatusButtonProps {
  // 挂起的权限请求（null = 无请求，整体不渲染）。
  request: PermissionRequest | null
  // 权限决策回传 main（允许全部 = session 级放行；永久允许/拒绝写回配置）。
  onRespond: (
    decision: "allow" | "deny",
    rememberForSession?: boolean,
    allowAll?: boolean,
    permanent?: boolean,
  ) => void
}

/**
 * Agent 状态栏权限请求指示（对齐 TodoStatusButton）：agent 发起权限请求时展示琥珀色盾牌 icon，
 * 请求到达自动展开常驻 LxTooltip（closeOnScroll/closeOnOutsideClick 均 false，右上角 [-] 或 Esc 最小化）。
 * 挂起期间 document 级捕获键：↑↓ 循环切换、Enter 确认、Esc 最小化；鼠标点击同样可选。
 * 选中"允许全部"进入确认态（确认/返回）。请求结束（agent_end）整体收起。
 */
export const PermissionStatusButton = ({
  request,
  onRespond,
}: PermissionStatusButtonProps): React.JSX.Element | null => {
  const [isOpen, setIsOpen] = useState(false)
  const [phase, setPhase] = useState<PermissionPanelPhase>("select")
  const [activeIndex, setActiveIndex] = useState(0)

  // 新请求到达自动展开并复位选择态；请求清空（agent_end）收起。
  useEffect(() => {
    if (!request) {
      setIsOpen(false)
      return
    }
    setIsOpen(true)
    setPhase("select")
    setActiveIndex(0)
  }, [request])

  // 决策映射（沿用原面板）：选择态六项 / 确认态"确认允许全部"与"返回"。
  const handleAction = (index: number): void => {
    if (phase === "select") {
      if (index === 0) {
        onRespond("allow")
      } else if (index === 1) {
        onRespond("allow", true)
      } else if (index === 2) {
        onRespond("allow", false, false, true) // 永久允许：写回配置，直接发送
      } else if (index === 3) {
        onRespond("deny")
      } else if (index === 4) {
        onRespond("deny", false, false, true) // 永久拒绝：写回配置，直接发送
      } else {
        setPhase("confirm")
        setActiveIndex(1) // 默认停在"返回"
      }
      return
    }
    if (index === 0) {
      onRespond("allow", false, true) // 允许全部
    } else {
      setPhase("select")
      setActiveIndex(5) // 返回选择，保留"允许全部"高亮
    }
  }

  // 稳定引用最新状态：document 级键盘监听只在请求挂起期间挂载一次。
  const stateRef = useRef({ isOpen, phase, activeIndex, handleAction })
  stateRef.current = { isOpen, phase, activeIndex, handleAction }

  useEffect(() => {
    if (!request) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      const {
        isOpen: open,
        phase: currentPhase,
        activeIndex: currentIndex,
        handleAction: act,
      } = stateRef.current
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        event.stopPropagation()
        if (!open) return
        const options =
          currentPhase === "select" ? PERMISSION_SELECT_OPTIONS : PERMISSION_CONFIRM_OPTIONS
        const offset = event.key === "ArrowDown" ? 1 : -1
        setActiveIndex((index) => (index + offset + options.length) % options.length)
        return
      }
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault()
        event.stopPropagation()
        if (open) act(currentIndex)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        setIsOpen(false) // 最小化：仅收起 tooltip，请求仍挂起、可点击 icon 重新展开
      }
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [request])

  if (!request) return null

  const options = phase === "select" ? PERMISSION_SELECT_OPTIONS : PERMISSION_CONFIRM_OPTIONS

  const tooltipContent = (
    <div className="flex min-w-[240px] flex-col gap-1.5">
      <span className="block w-fit max-w-full truncate rounded-[4px] bg-amber-300/10 px-1.5 py-0.5 font-mono text-[12px] text-amber-300">
        {request.toolName}
      </span>
      {phase === "confirm" && (
        <p className="text-xs text-amber-300/90">允许当前对话全部工具与 MCP 不再询问？</p>
      )}
      <div className="flex flex-col gap-0.5">
        {options.map((option, index) => (
          <button
            key={option.key}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={index === activeIndex}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => handleAction(index)}
            className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-[4px] px-2 text-left outline-none transition-colors focus:outline-none focus-visible:outline-none ${toneClass(
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
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <LxTooltip
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger="click"
      placement="top"
      minimizable
      closeOnScroll={false}
      closeOnOutsideClick={true}
      title={
        <span className="flex min-w-0 items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span className="shrink-0 text-[13px] font-medium text-white/90">Permission</span>
          <span className="ml-auto shrink-0 text-[12px] text-white/50">{request.mode}</span>
        </span>
      }
      content={tooltipContent}
    >
      <span
        aria-label="权限确认"
        className="flex shrink-0 cursor-default items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 text-xs text-amber-300/90 outline-none ring-0 transition-colors hover:bg-white/5 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
      >
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      </span>
    </LxTooltip>
  )
}
