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

  return { BrowserWindow: FakeBrowserWindow }
})

vi.mock("@/paths", () => ({
  getSessionDesignDir: (sessionId: string, designId: string): string =>
    join(holder.designRoot, sessionId, designId),
}))

import {
  buildDesignPreviewUrl,
  buildThemeInjectionScript,
  exportFrontDesignPng,
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
  })

  afterEach(() => {
    if (holder.designRoot && existsSync(holder.designRoot)) {
      rmSync(holder.designRoot, { recursive: true, force: true })
    }
  })

  it("按视口宽度与文档全高截图并写入 preview-{viewport}.png", async () => {
    writeDesignEntry()

    const result = await exportFrontDesignPng({
      sessionId: SESSION_ID,
      designId: DESIGN_ID,
      viewport: "tablet",
      theme: "dark",
    })

    expect(result.ok).toBe(true)
    expect(result.path).toBe(join(designDir(), "preview-tablet.png"))
    expect(existsSync(result.path as string)).toBe(true)
    expect(readFileSync(result.path as string)).toEqual(holder.png)

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
    expect(existsSync(join(designDir(), "preview-mobile.png"))).toBe(false)
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
