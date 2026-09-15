import type { CSSProperties } from "react"
import type { AgentPanelKind } from "./types"

export const panelClassName =
  "scrollbar-hidden pointer-events-auto fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-sm shadow-[0_10px_28px_rgba(0,0,0,0.45)]"

/**
 * 读取 CSS 变量中的尺寸（支持 px/rem/vh/vw）换算为像素。
 */
const getCssDimensionInPixels = (variableName: string): number => {
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()
  const value = Number.parseFloat(cssValue)
  if (!Number.isFinite(value)) return 0

  if (cssValue.endsWith("rem")) {
    return value * Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  }
  if (cssValue.endsWith("vh")) return (value / 100) * window.innerHeight
  if (cssValue.endsWith("vw")) return (value / 100) * window.innerWidth

  return value
}

/**
 * 根据输入框容器位置计算面板在视口内的位置：下方空间不足时向上翻转，
 * 空间都不足时收窄最大高度，保证面板完整可见。
 */
export const getAgentPanelPosition = (kind: AgentPanelKind, rect: DOMRect): CSSProperties => {
  const maxHeight = getCssDimensionInPixels(
    kind === "file"
      ? "--agent-input-file-menu-max-height"
      : "--agent-input-command-menu-max-height",
  )
  const offset = 6
  const left = Math.min(Math.max(rect.left, 8), Math.max(window.innerWidth - rect.width - 8, 8))
  const horizontal = { left, width: rect.width }

  const spaceBelow = window.innerHeight - rect.bottom
  if (spaceBelow >= maxHeight) {
    return { ...horizontal, maxHeight, top: rect.bottom + offset, bottom: "auto" }
  }

  const aboveMaxHeight = Math.min(maxHeight, Math.max(rect.top - offset - 8, 0))
  if (aboveMaxHeight > 0) {
    return {
      ...horizontal,
      maxHeight: aboveMaxHeight,
      top: "auto",
      bottom: window.innerHeight - rect.top + offset,
    }
  }

  return {
    ...horizontal,
    maxHeight: Math.max(spaceBelow - offset - 8, 0),
    top: rect.bottom + offset,
    bottom: "auto",
  }
}
