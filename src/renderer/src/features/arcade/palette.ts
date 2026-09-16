import type { AppTheme } from "@/stores/themeStore"
import type { ArcadePalette } from "./types"

const DEFAULT_PALETTE: ArcadePalette = {
  background: "#0d1117",
  backgroundAlt: "#151b24",
  grid: "rgba(255, 255, 255, 0.06)",
  surface: "rgba(255, 255, 255, 0.045)",
  surfaceStrong: "rgba(255, 255, 255, 0.12)",
  border: "rgba(255, 255, 255, 0.16)",
  text: "rgba(255, 255, 255, 0.94)",
  textMuted: "rgba(255, 255, 255, 0.42)",
  accent: "#38bdf8",
  accentSoft: "rgba(56, 189, 248, 0.22)",
  success: "#34d399",
  danger: "#fb7185",
  star: "#facc15",
  fontFamily: '"JetBrains Mono", "Cascadia Code", Menlo, monospace',
  glow: true,
  pixel: false,
  radius: 8,
}

const MINECRAFT_PALETTE: ArcadePalette = {
  background: "#141419",
  backgroundAlt: "#1b1b26",
  grid: "rgba(255, 255, 255, 0.07)",
  surface: "#242434",
  surfaceStrong: "#2f2f46",
  border: "#000000",
  text: "#e8e8f0",
  textMuted: "#a6a6bc",
  accent: "#55ff55",
  accentSoft: "rgba(85, 255, 85, 0.18)",
  success: "#55ff55",
  danger: "#ff5555",
  star: "#ffaa00",
  fontFamily: '"JetBrains Mono", "Cascadia Code", Menlo, monospace',
  glow: false,
  pixel: true,
  radius: 0,
}

/**
 * 按当前 app 主题返回游戏色板。
 */
export const getArcadePalette = (theme: AppTheme): ArcadePalette =>
  theme === "minecraft" ? MINECRAFT_PALETTE : DEFAULT_PALETTE
