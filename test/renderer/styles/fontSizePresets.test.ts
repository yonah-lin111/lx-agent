import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const stylesCss = readFileSync(
  fileURLToPath(new URL("../../../src/renderer/src/styles.css", import.meta.url)),
  "utf8",
)

describe("字号预设", () => {
  it("仅保留 xs/sm/lg 三档，且值分别为 12/14/16px", () => {
    expect(stylesCss).toContain("--text-*: initial")
    expect(stylesCss).toContain("--text-xs: 12px")
    expect(stylesCss).toContain("--text-sm: 14px")
    expect(stylesCss).toContain("--text-lg: 16px")
    expect(stylesCss).not.toMatch(/--font-size-/)
  })

  it("未显式指定字号时正文字号使用 sm 预设（14px）", () => {
    expect(stylesCss).toMatch(/body\s*\{[^}]*font-size:\s*14px/)
  })
})
