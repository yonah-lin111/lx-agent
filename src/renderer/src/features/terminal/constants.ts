import type { ITerminalOptions } from "@xterm/xterm"

// Ghostty 风格深色主题调色盘。
export const GHOSTTY_TERMINAL_THEME = {
  background: "#141414",
  foreground: "#e4e4e7",
  cursor: "#ffffff",
  cursorAccent: "#141414",
  selectionBackground: "rgba(255, 255, 255, 0.22)",
  selectionInactiveBackground: "rgba(255, 255, 255, 0.1)",
  black: "#1e1e2e",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#cba6f7",
  cyan: "#94e2d5",
  white: "#cdd6f4",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#cba6f7",
  brightCyan: "#94e2d5",
  brightWhite: "#ffffff",
} as const

// 默认 xterm 配置。
export const DEFAULT_XTERM_OPTIONS: ITerminalOptions = {
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 12,
  lineHeight: 1.25,
  cursorBlink: true,
  cursorStyle: "bar",
  cursorWidth: 2,
  theme: GHOSTTY_TERMINAL_THEME,
  allowTransparency: true,
  smoothScrollDuration: 100,
  convertEol: true,
}
