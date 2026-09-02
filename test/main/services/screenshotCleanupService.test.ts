import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { getScreenshotsDir } from "@/paths"
import { cleanExpiredScreenshots } from "@/services/screenshotCleanupService"
import { saveUiSettings } from "@/services/settingsService"

describe("screenshotCleanupService", () => {
  const dir = getScreenshotsDir()
  const oldFile = join(dir, "test-old-screenshot.png")
  const newFile = join(dir, "test-new-screenshot.png")

  afterEach(() => {
    try {
      saveUiSettings({ locale: "en", screenshotCleanupEnabled: true })
    } catch {}
  })

  it("should clean expired screenshots (> 14 days) and keep recent ones", () => {
    saveUiSettings({ locale: "en", screenshotCleanupEnabled: true })
    mkdirSync(dir, { recursive: true })

    writeFileSync(oldFile, "old-image-data")
    writeFileSync(newFile, "new-image-data")

    const fifteenDaysAgo = (Date.now() - 15 * 24 * 60 * 60 * 1000) / 1000
    utimesSync(oldFile, fifteenDaysAgo, fifteenDaysAgo)

    cleanExpiredScreenshots()

    expect(existsSync(oldFile)).toBe(false)
    expect(existsSync(newFile)).toBe(true)
  })

  it("should not clean screenshots when screenshotCleanupEnabled is false", () => {
    saveUiSettings({ locale: "en", screenshotCleanupEnabled: false })
    mkdirSync(dir, { recursive: true })

    const oldFileDisabled = join(dir, "test-old-screenshot-disabled.png")
    writeFileSync(oldFileDisabled, "old-image-data")

    const fifteenDaysAgo = (Date.now() - 15 * 24 * 60 * 60 * 1000) / 1000
    utimesSync(oldFileDisabled, fifteenDaysAgo, fifteenDaysAgo)

    cleanExpiredScreenshots()

    expect(existsSync(oldFileDisabled)).toBe(true)
  })
})
