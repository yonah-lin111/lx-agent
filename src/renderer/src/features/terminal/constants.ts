import type { ITerminalOptions } from "@xterm/xterm"

// Ghostty 风格高活力深色主题调色盘（现代 Vibrant ANSI 配色，高明度、高饱和与柔和护眼对比度）。
export const GHOSTTY_TERMINAL_THEME = {
  background: "#111116",
  foreground: "#f0f6fc",
  cursor: "#38bdf8",
  cursorAccent: "#111116",
  selectionBackground: "rgba(56, 189, 248, 0.32)",
  selectionInactiveBackground: "rgba(255, 255, 255, 0.08)",
  // 标准 ANSI 基础 8 色（明亮、通透）
  black: "#21262d",
  red: "#ff5370",
  green: "#2ed573",
  yellow: "#ffb86c",
  blue: "#38bdf8",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#f1f5f9",
  // ANSI 高亮 8 色 (Bright，更加活力鲜艳)
  brightBlack: "#8b949e",
  brightRed: "#ff7675",
  brightGreen: "#55efc4",
  brightYellow: "#ffeaa7",
  brightBlue: "#70a1ff",
  brightMagenta: "#e056fd",
  brightCyan: "#67e8f9",
  brightWhite: "#ffffff",
} as const

// 默认 xterm 配置。
export const DEFAULT_XTERM_OPTIONS: ITerminalOptions = {
  fontFamily:
    'ui-monospace, "SF Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 13,
  lineHeight: 1.0,
  letterSpacing: 0,
  cursorBlink: true,
  cursorStyle: "bar",
  cursorWidth: 2,
  theme: GHOSTTY_TERMINAL_THEME,
  allowTransparency: true,
  smoothScrollDuration: 0,
  convertEol: false,
  drawBoldTextInBrightColors: true,
  minimumContrastRatio: 4.5,
  rescaleOverlappingGlyphs: true,
  allowProposedApi: true,
}
