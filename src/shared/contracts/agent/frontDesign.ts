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
}

export interface ExportFrontDesignPngResult {
  ok: boolean
  // 导出成功的 PNG 绝对路径。
  path?: string
  error?: string
}
