import type React from "react"

export interface GbaIconProps {
  className?: string
}

// GBA 横版掌机轮廓：机身与屏幕 / 十字键 / A、B 键镂空共用一条 evenodd 路径，小尺寸下仍可辨识。
const GBA_PATH =
  "M5 6h14a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3ZM4.5 8h7.5v4.5H4.5ZM7.05 13.25h1.4v1.05h1.05v1.4H8.45v1.05h-1.4V15.7H6v-1.4h1.05ZM16 14.1a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 1 0 0-2.3ZM18.75 11.6a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 1 0 0-2.3Z"

/**
 * GBA 掌机图标：用于标识导入的 GBA ROM，实心剪影风格以保证小尺寸下的辨识度。
 */
export const GbaIcon = ({ className }: GbaIconProps): React.JSX.Element => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" clipRule="evenodd" d={GBA_PATH} />
  </svg>
)
