import type { CSSProperties } from "react"

// Markdown 弹出面板类型。
export type MarkdownPanelKind = "block" | "file" | "slash"

/**
 * 将样式配置中的尺寸换算为像素，供面板边界定位使用。
 */
export const getCssDimensionInPixels = (variableName: string): number => {
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
 * 根据 CSS 中的面板尺寸计算可视区域内的位置。
 */
export const getMarkdownPanelPosition = (
  kind: MarkdownPanelKind,
  coords: { bottom: number; left: number; top: number },
  horizontalPosition = coords.left,
): CSSProperties => {
  const panelWidth = getCssDimensionInPixels(`--markdown-command-menu-${kind}-width`)
  const maxHeight = getCssDimensionInPixels(`--markdown-command-menu-${kind}-max-height`)
  const offset = 6
  const left = Math.min(
    Math.max(horizontalPosition, 8),
    Math.max(window.innerWidth - panelWidth - 8, 8),
  )

  return window.innerHeight - coords.bottom < maxHeight
    ? { left, top: "auto", bottom: window.innerHeight - coords.top + offset }
    : { left, top: coords.bottom + offset, bottom: "auto" }
}
