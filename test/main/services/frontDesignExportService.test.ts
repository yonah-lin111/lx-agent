// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

interface FakeBrowserWindow {
  loadURL: ReturnType<typeof vi.fn>
  setContentSize: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  webContents: {
    executeJavaScript: ReturnType<typeof vi.fn>
    capturePage: ReturnType<typeof vi.fn>
  }
}

const holder = vi.hoisted(() => ({
  windows: [] as FakeBrowserWindow[],
  designRoot: "",
  loadURLImpl: null as null | (() => Promise<void>),
  measuredHeight: 2400,
  png: Buffer.from("fake-png-bytes"),
  // 保存对话框返回的文件路径；null 表示用户取消。
  saveFilePath: null as string | null,
  saveDialogCalls: [] as Array<Record<string, unknown>>,
}))

vi.mock("electron", () => {
  class FakeBrowserWindow {
    loadURL = vi.fn(() => (holder.loadURLImpl ? holder.loadURLImpl() : Promise.resolve()))
    setContentSize = vi.fn()
    isDestroyed = vi.fn(() => false)
    destroy = vi.fn()
    webContents = {
      executeJavaScript: vi.fn(async () => holder.measuredHeight),
      capturePage: vi.fn(async () => ({ toPNG: () => holder.png })),
    }

    constructor() {
      holder.windows.push(this as unknown as FakeBrowserWindow)
    }
  }

  return {
    BrowserWindow: FakeBrowserWindow,
    dialog: {
      showSaveDialog: vi.fn(async (options: Record<string, unknown>) => {
        holder.saveDialogCalls.push(options)
        return holder.saveFilePath
          ? { canceled: false, filePath: holder.saveFilePath }
          : { canceled: true, filePath: undefined }
      }),
    },
  }
})

vi.mock("@/paths", () => ({
  getSessionDesignDir: (sessionId: string, designId: string): string =>
    join(holder.designRoot, sessionId, designId),
}))

import {
  buildDesignPreviewUrl,
  buildThemeInjectionScript,
  ensurePngExtension,
  exportFrontDesignPng,
  resolveExportTargetPath,
  resolvePreviewPngPath,
  VIEWPORT_WIDTHS,
} from "@/services/frontDesignExportService"

const SESSION_ID = "session-export"
const DESIGN_ID = "design-export"

const designDir = (): string => join(holder.designRoot, SESSION_ID, DESIGN_ID)

const writeDesignEntry = (): void => {
  mkdirSync(designDir(), { recursive: true })
  writeFileSync(join(designDir(), "index.html"), "<!DOCTYPE html><html><body>Hello</body></html>")
}

describe("frontDesignExportService", () => {
  beforeEach(() => {
    holder.designRoot = mkdtempSync(join(tmpdir(), "lx-design-export-"))
    holder.windows = []
    holder.loadURLImpl = null
    holder.measuredHeight = 2400
    holder.png = Buffer.from("fake-png-bytes")
    holder.saveFilePath = join(holder.designRoot, "chosen", "shot.png")
    holder.saveDialogCalls = []
    mkdirSync(join(holder.designRoot, "chosen"), { recursive: true })
  })

  afterEach(() => {
    if (holder.designRoot && existsSync(holder.designRoot)) {
      rmSync(holder.designRoot, { recursive: true, force: true })
    }
  })

  it("按视口宽度与文档全高截图并写入保存对话框选定路径", async () => {
    writeDesignEntry()

    const result = await exportFrontDesignPng({
      sessionId: SESSION_ID,
      designId: DESIGN_ID,
      viewport: "tablet",
      theme: "dark",
    })

    expect(result.ok).toBe(true)
    expect(result.path).toBe(join(holder.designRoot, "chosen", "shot.png"))
    expect(existsSync(result.path as string)).toBe(true)
    expect(readFileSync(result.path as string)).toEqual(holder.png)
    // 对话框默认落点为设计目录下的 preview-{viewport}.png
    expect(holder.saveDialogCalls[0]?.defaultPath).toBe(join(designDir(), "preview-tablet.png"))

    expect(holder.windows).toHaveLength(1)
    const win = holder.windows[0]!
    expect(win.loadURL).toHaveBeenCalledWith(buildDesignPreviewUrl(SESSION_ID, DESIGN_ID))
    expect(win.webContents.executeJavaScript).toHaveBeenCalledWith(
      buildThemeInjectionScript("dark"),
    )
    expect(win.setContentSize).toHaveBeenCalledWith(VIEWPORT_WIDTHS.tablet, 2400)
    expect(win.webContents.capturePage).toHaveBeenCalledTimes(1)
    expect(win.destroy).toHaveBeenCalledTimes(1)
  })

  it("截图高度被钳制在上限内，避免异常页面撑爆窗口", async () => {
    writeDesignEntry()
    holder.measuredHeight = 999_999

    const result = await exportFrontDesignPng({
      sessionId: SESSION_ID,
      designId: DESIGN_ID,
      viewport: "desktop",
      theme: "light",
    })

    expect(result.ok).toBe(true)
    expect(holder.windows[0]!.setContentSize).toHaveBeenCalledWith(VIEWPORT_WIDTHS.desktop, 12000)
  })

  it("拒绝包含路径穿越的 sessionId/designId", async () => {
    writeDesignEntry()

    const result = await exportFrontDesignPng({
      sessionId: "../evil",
      designId: DESIGN_ID,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Invalid sessionId or designId/)
    expect(holder.windows).toHaveLength(0)
  })

  it("落盘入口不存在时返回失败且不创建窗口", async () => {
    const result = await exportFrontDesignPng({
      sessionId: SESSION_ID,
      designId: DESIGN_ID,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Design entry not found/)
    expect(holder.windows).toHaveLength(0)
  })

  it("页面加载失败时返回错误并销毁窗口", async () => {
    writeDesignEntry()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    holder.loadURLImpl = () => Promise.reject(new Error("load boom"))

    const result = await exportFrontDesignPng({
      sessionId: SESSION_ID,
      designId: DESIGN_ID,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe("load boom")
    expect(holder.windows[0]!.destroy).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it("截图结果为空时返回失败，不写入空文件", async () => {
    writeDesignEntry()
    holder.png = Buffer.alloc(0)

    const result = await exportFrontDesignPng({
      sessionId: SESSION_ID,
      designId: DESIGN_ID,
      viewport: "mobile",
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Captured image is empty/)
    expect(existsSync(join(holder.designRoot, "chosen", "shot.png"))).toBe(false)
  })

  it("用户取消保存对话框时返回 cancelled 且不创建窗口、不落盘", async () => {
    writeDesignEntry()
    holder.saveFilePath = null

    const result = await exportFrontDesignPng({
      sessionId: SESSION_ID,
      designId: DESIGN_ID,
      viewport: "desktop",
    })

    expect(result.ok).toBe(false)
    expect(result.cancelled).toBe(true)
    expect(result.error).toBeUndefined()
    expect(holder.windows).toHaveLength(0)
  })

  it("显式 targetPath 跳过对话框；缺省扩展名自动补 .png", async () => {
    writeDesignEntry()
    mkdirSync(join(holder.designRoot, "explicit"), { recursive: true })
    const explicit = join(holder.designRoot, "explicit", "hero")

    const result = await exportFrontDesignPng({
      sessionId: SESSION_ID,
      designId: DESIGN_ID,
      targetPath: explicit,
    })

    expect(result.ok).toBe(true)
    expect(result.path).toBe(`${explicit}.png`)
    expect(holder.saveDialogCalls).toHaveLength(0)
    expect(existsSync(`${explicit}.png`)).toBe(true)
  })

  it("记住上次导出目录，作为下次对话框默认落点", async () => {
    writeDesignEntry()

    await exportFrontDesignPng({ sessionId: SESSION_ID, designId: DESIGN_ID })
    await exportFrontDesignPng({ sessionId: SESSION_ID, designId: DESIGN_ID, viewport: "mobile" })

    expect(holder.saveDialogCalls[1]?.defaultPath).toBe(
      join(holder.designRoot, "chosen", "preview-mobile.png"),
    )
  })

  it("ensurePngExtension 仅补齐缺失的 .png", () => {
    expect(ensurePngExtension("/tmp/a/b.png")).toBe("/tmp/a/b.png")
    expect(ensurePngExtension("/tmp/a/b")).toBe("/tmp/a/b.png")
    expect(ensurePngExtension("/tmp/a/b.PNG")).toBe("/tmp/a/b.PNG")
  })

  it("resolveExportTargetPath 对空白 targetPath 回退到保存对话框", async () => {
    const resolved = await resolveExportTargetPath({
      sessionId: SESSION_ID,
      designId: DESIGN_ID,
      targetPath: "   ",
    })

    expect(resolved).toBe(join(holder.designRoot, "chosen", "shot.png"))
    expect(holder.saveDialogCalls).toHaveLength(1)
  })

  it("辅助函数：URL 编码与主题脚本按契约生成", () => {
    expect(buildDesignPreviewUrl("s 1", "d/2")).toBe("lx-design://design/s%201/d%2F2/index.html")
    expect(resolvePreviewPngPath("s", "d", "mobile")).toBe(
      join(holder.designRoot, "s", "d", "preview-mobile.png"),
    )
    expect(buildThemeInjectionScript("dark")).toContain('classList.add("dark")')
    expect(buildThemeInjectionScript("light")).toContain('classList.remove("dark")')
    expect(VIEWPORT_WIDTHS).toEqual({ desktop: 1440, tablet: 768, mobile: 375 })
  })
})
