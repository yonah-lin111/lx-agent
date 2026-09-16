// 彩蛋游戏标识。
export type ArcadeGameId = "tetris" | "dodge" | "hop"

// 主题化游戏色板（默认主题霓虹 / Minecraft 像素）。
export interface ArcadePalette {
  background: string
  backgroundAlt: string
  grid: string
  surface: string
  surfaceStrong: string
  border: string
  text: string
  textMuted: string
  accent: string
  accentSoft: string
  success: string
  danger: string
  star: string
  fontFamily: string
  glow: boolean
  pixel: boolean
  radius: number
}

// 每帧输入快照。
export interface ArcadeInputState {
  // 当前按住的键（KeyboardEvent.code）。
  keys: Set<string>
  // 本帧新按下的键（每帧结束后清空）。
  pressedKeys: Set<string>
}

// 单款小游戏运行时接口（几何与玩法不感知主题，主题只驱动色板渲染）。
export interface ArcadeGame {
  update: (dt: number, input: ArcadeInputState) => void
  render: (ctx: CanvasRenderingContext2D, palette: ArcadePalette) => void
  pointerDown?: (x: number, y: number) => void
  pointerMove?: (x: number, y: number) => void
  pointerUp?: (x: number, y: number) => void
  getScore: () => number
  isFinished: () => boolean
  dispose?: () => void
}
