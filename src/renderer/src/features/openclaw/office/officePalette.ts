// 员工强调色：名册、对话气泡与像素办公室共用同一套取色规则。

const ACCENT_HEX = ["#ff6b6b", "#6bcf7f", "#4ecdc4", "#ffd93d", "#b197fc", "#ffa07a", "#4ea1ff"]

/**
 * 按员工序号取强调色（十六进制，用于 UI）。
 */
export const accentHexForIndex = (index: number): string =>
  ACCENT_HEX[((index % ACCENT_HEX.length) + ACCENT_HEX.length) % ACCENT_HEX.length]

/**
 * 按员工序号取强调色（数值，用于 PixiJS 绘制）。
 */
export const accentNumberForIndex = (index: number): number =>
  Number.parseInt(accentHexForIndex(index).replace("#", ""), 16)
