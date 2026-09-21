// 前端设计预览图导出：离屏 BrowserWindow 加载 lx-design:// 落盘产物并截取全页 PNG。

import { existsSync, writeFileSync } from "node:fs"
import { dirname, extname, join } from "node:path"
import type {
  ExportFrontDesignPngOptions,
  ExportFrontDesignPngResult,
  FrontDesignPreviewTheme,
  FrontDesignViewport,
} from "@shared/contracts/agent"
import { BrowserWindow, dialog } from "electron"
import { getSessionDesignDir } from "../paths"

// 视口档位对应的固定导出宽度（与画布预览档位一致，保证结果可复现）。
export const VIEWPORT_WIDTHS: Record<FrontDesignViewport, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
}

// 初始窗口高度；实际高度按文档内容测量后调整。
const INITIAL_HEIGHT = 900
// 截图高度上限，避免异常页面撑爆窗口与显存。
const MAX_CAPTURE_HEIGHT = 12000
// 主题注入/布局稳定等待时长。
const SETTLE_DELAY_MS = 200

// 目录段消毒：拒绝路径穿越与分隔符，防止越权读写。
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/

const isSafeSegment = (value: string): boolean =>
  SAFE_SEGMENT.test(value) && value !== "." && value !== ".."

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 构造预览图导出的 PNG 路径：`{designDir}/preview-{viewport}.png`。 */
export const resolvePreviewPngPath = (
  sessionId: string,
  designId: string,
  viewport: FrontDesignViewport,
): string => `${getSessionDesignDir(sessionId, designId)}/preview-${viewport}.png`

/** 构造 lx-design:// 预览地址。 */
export const buildDesignPreviewUrl = (sessionId: string, designId: string): string =>
  `lx-design://design/${encodeURIComponent(sessionId)}/${encodeURIComponent(designId)}/index.html`

// 记住上次导出目录，作为下次保存对话框的默认落点。
let lastExportDir: string | null = null

/** 补齐 .png 扩展名（用户在对话框中可能省略）。 */
export const ensurePngExtension = (targetPath: string): string =>
  extname(targetPath).toLowerCase() === ".png" ? targetPath : `${targetPath}.png`

/**
 * 解析导出目标路径：显式 targetPath 直接使用，否则弹出系统保存对话框。
 * 用户取消时返回 null。
 */
export const resolveExportTargetPath = async (
  options: ExportFrontDesignPngOptions,
): Promise<string | null> => {
  const { sessionId, designId, viewport = "desktop", targetPath } = options
  if (targetPath && targetPath.trim()) {
    return ensurePngExtension(targetPath.trim())
  }

  const fallbackPath = resolvePreviewPngPath(sessionId, designId, viewport)
  const result = await dialog.showSaveDialog({
    title: "Export Preview Image",
    defaultPath: lastExportDir ? join(lastExportDir, `preview-${viewport}.png`) : fallbackPath,
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  })

  if (result.canceled || !result.filePath) return null

  const selected = ensurePngExtension(result.filePath)
  lastExportDir = dirname(selected)
  return selected
}

/** 与画布一致的主题注入脚本：切换 html 根节点 dark 类与 color-scheme。 */
export const buildThemeInjectionScript = (theme: FrontDesignPreviewTheme): string =>
  [
    "(() => {",
    "  const root = document.documentElement;",
    `  root.classList.${theme === "dark" ? "add" : "remove"}("dark");`,
    `  root.style.colorScheme = "${theme}";`,
    "  return true;",
    "})()",
  ].join("\n")

/**
 * 导出设计预览 PNG。
 *
 * 加载已落盘的 `index.html`（含编译后的 Tailwind CSS），按档位宽度测量文档全高后截取整页。
 * 失败不抛异常，统一返回 `{ ok: false, error }`。
 */
export const exportFrontDesignPng = async (
  options: ExportFrontDesignPngOptions,
): Promise<ExportFrontDesignPngResult> => {
  const { sessionId, designId, viewport = "desktop", theme = "dark" } = options

  if (!isSafeSegment(sessionId) || !isSafeSegment(designId)) {
    return { ok: false, error: "Invalid sessionId or designId" }
  }

  const htmlPath = `${getSessionDesignDir(sessionId, designId)}/index.html`
  if (!existsSync(htmlPath)) {
    return { ok: false, error: `Design entry not found: ${htmlPath}` }
  }

  // 先确定落点：用户取消时直接返回，不创建离屏窗口。
  const pngPath = await resolveExportTargetPath(options)
  if (!pngPath) {
    return { ok: false, cancelled: true }
  }

  const width = VIEWPORT_WIDTHS[viewport]
  let win: BrowserWindow | null = null

  try {
    win = new BrowserWindow({
      show: false,
      width,
      height: INITIAL_HEIGHT,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    })

    await win.loadURL(buildDesignPreviewUrl(sessionId, designId))
    await win.webContents.executeJavaScript(buildThemeInjectionScript(theme))
    await delay(SETTLE_DELAY_MS)

    const measured = await win.webContents.executeJavaScript(
      "Math.max(document.documentElement ? document.documentElement.scrollHeight : 0, document.body ? document.body.scrollHeight : 0)",
    )
    const parsed = typeof measured === "number" && Number.isFinite(measured) ? measured : 0
    const height = Math.min(Math.max(parsed, INITIAL_HEIGHT), MAX_CAPTURE_HEIGHT)
    win.setContentSize(width, height)
    await delay(SETTLE_DELAY_MS)

    // stayHidden：截图计数结束后保持页面隐藏，不闪现窗口。
    const image = await win.webContents.capturePage(undefined, { stayHidden: true })
    const png = image.toPNG()
    if (!png || png.length === 0) {
      return { ok: false, error: "Captured image is empty" }
    }

    writeFileSync(pngPath, png)
    return { ok: true, path: pngPath }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[FrontDesignExportService] Failed to export preview for ${designId}:`, err)
    return { ok: false, error: errorMsg }
  } finally {
    if (win && !win.isDestroyed()) {
      win.destroy()
    }
  }
}
