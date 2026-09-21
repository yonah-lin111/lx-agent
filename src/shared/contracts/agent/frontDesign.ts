// 前端设计看板 IPC 契约：预览图导出。

// 画布视口档位（与 renderer 端 FrontDesignPage 的 ViewportMode 对齐）。
export type FrontDesignViewport = "desktop" | "tablet" | "mobile"

// 预览图主题（与画布实际显式模式对齐）。
export type FrontDesignPreviewTheme = "light" | "dark"

export interface ExportFrontDesignPngOptions {
  sessionId: string
  designId: string
  viewport?: FrontDesignViewport
  theme?: FrontDesignPreviewTheme
  // 显式导出目标（绝对路径）；缺省时由主进程弹出系统保存对话框让用户选择。
  targetPath?: string
}

export interface ExportFrontDesignPngResult {
  ok: boolean
  // 导出成功的 PNG 绝对路径。
  path?: string
  // 用户在保存对话框中取消，非错误。
  cancelled?: boolean
  error?: string
}
