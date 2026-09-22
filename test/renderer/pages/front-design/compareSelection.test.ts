// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import type { FrontDesignItem } from "@/features/agent/hooks/frontDesignStore"
import { pickDefaultCompareDesign } from "@/pages/front-design/utils/compareSelection"

const item = (id: string, version: number): FrontDesignItem => ({
  id,
  version,
  title: id,
  html: `<div>${id}</div>`,
  updatedAt: version,
})

describe("pickDefaultCompareDesign", () => {
  const versions = [item("v1", 1), item("v2", 2), item("v3", 3)]

  it("优先取当前版本的前一版", () => {
    expect(pickDefaultCompareDesign(versions, "v3")).toBe("v2")
    expect(pickDefaultCompareDesign(versions, "v2")).toBe("v1")
  })

  it("当前是首版时取后一版", () => {
    expect(pickDefaultCompareDesign(versions, "v1")).toBe("v2")
  })

  it("仅一个版本返回 null", () => {
    expect(pickDefaultCompareDesign([item("v1", 1)], "v1")).toBeNull()
    expect(pickDefaultCompareDesign([], "v1")).toBeNull()
  })

  it("activeDesignId 为空或不在版本族内返回 null", () => {
    expect(pickDefaultCompareDesign(versions, null)).toBeNull()
    expect(pickDefaultCompareDesign(versions, "missing")).toBeNull()
  })
})
