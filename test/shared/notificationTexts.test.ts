import { NOTIFICATION_TEXTS } from "@shared/notificationTexts"
import { describe, expect, it } from "vitest"

describe("NOTIFICATION_TEXTS", () => {
  it("所有 Locale 均提供完整且非空的文案", () => {
    for (const locale of ["en", "zh"] as const) {
      const texts = NOTIFICATION_TEXTS[locale]
      expect(texts).toBeDefined()
      expect(texts.completedBody.trim()).not.toBe("")
      expect(texts.failedBody.trim()).not.toBe("")
    }
  })

  it("中英文案互不相同", () => {
    expect(NOTIFICATION_TEXTS.zh.completedBody).not.toBe(NOTIFICATION_TEXTS.en.completedBody)
    expect(NOTIFICATION_TEXTS.zh.failedBody).not.toBe(NOTIFICATION_TEXTS.en.failedBody)
  })
})
