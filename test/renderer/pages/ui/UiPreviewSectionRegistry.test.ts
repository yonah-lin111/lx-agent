import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { UI_SECTIONS } from "@/features/ui-preview"
import { uiPreview as enUiPreview } from "@/i18n/locales/en/uiPreview"
import { uiPreview as zhUiPreview } from "@/i18n/locales/zh/uiPreview"

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const uiIndexPath = path.join(repoRoot, "src/renderer/src/pages/ui/index.tsx")

// 按点路径读取嵌套词条（去掉 uiPreview 前缀，直接传入分部字典）。
const getNestedValue = (obj: unknown, keyPath: string): string | undefined => {
  let current: unknown = obj
  for (const part of keyPath.split(".")) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof current === "string" ? current : undefined
}

// 提取 index.tsx 中 activeSection 分支承载的分区 id。
const extractRenderedSectionIds = (source: string): string[] =>
  Array.from(source.matchAll(/activeSection === "([^"]+)"/g), (match) => match[1])

describe("UI Preview 分区注册表", () => {
  it("UI_SECTIONS 分区 id 全局唯一", () => {
    const ids = UI_SECTIONS.map((section) => section.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("input 与 agent-input 分属不同分区，不再共用同一分支", () => {
    const ids = UI_SECTIONS.map((section) => section.id)
    expect(ids).toContain("input")
    expect(ids).toContain("agent-input")
    expect(ids.filter((id) => id === "input")).toHaveLength(1)
  })

  it("每个分区在 index.tsx 中恰好有一个渲染分支", () => {
    const source = readFileSync(uiIndexPath, "utf8")
    const renderedIds = extractRenderedSectionIds(source)
    const registeredIds = UI_SECTIONS.map((section) => section.id)

    expect(new Set(renderedIds).size).toBe(renderedIds.length)
    expect([...renderedIds].sort()).toEqual([...registeredIds].sort())
  })

  it("每个分区的描述词条在 zh / en 字典中都存在", () => {
    for (const section of UI_SECTIONS) {
      const keyPath = section.descriptionKey.replace(/^uiPreview\./, "")
      expect(
        getNestedValue(zhUiPreview, keyPath),
        `zh 缺失: ${section.descriptionKey}`,
      ).toBeTruthy()
      expect(
        getNestedValue(enUiPreview, keyPath),
        `en 缺失: ${section.descriptionKey}`,
      ).toBeTruthy()
    }
  })
})
