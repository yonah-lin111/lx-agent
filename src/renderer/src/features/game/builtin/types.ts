// 内置游戏标识。
export type BuiltinGameId = "tetris" | "dodge" | "cake"

// 主题化游戏色板（默认主题霓虹 / 像素主题）。
export interface BuiltinPalette {
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
export interface BuiltinInputState {
  // 当前按住的键（KeyboardEvent.code）。
  keys: Set<string>
  // 本帧新按下的键（每帧结束后清空）。
  pressedKeys: Set<string>
}

// 单款内置游戏运行时接口（几何与玩法不感知主题，主题只驱动色板渲染）。
export interface BuiltinGame {
  update: (dt: number, input: BuiltinInputState) => void
  render: (ctx: CanvasRenderingContext2D, palette: BuiltinPalette) => void
  pointerDown?: (x: number, y: number) => void
  pointerMove?: (x: number, y: number) => void
  pointerUp?: (x: number, y: number) => void
  getScore: () => number
  isFinished: () => boolean
  dispose?: () => void
}
