import { describe, expect, it } from "vitest"
import { formatSubagentLabel } from "@/features/agent/utils/subagentLabel"

describe("formatSubagentLabel", () => {
  it("有角色且名称不同时展示名称与角色标注", () => {
    expect(formatSubagentLabel("tool-registry-explorer", "explorer")).toBe(
      " - tool-registry-explorer (explorer)",
    )
  })

  it("名称与角色一致时仅展示一次", () => {
    expect(formatSubagentLabel("explorer", "explorer")).toBe(" - explorer")
  })

  it("无角色时沿用 (task) 工具标注", () => {
    expect(formatSubagentLabel("analyst")).toBe(" - analyst(task)")
    expect(formatSubagentLabel("task")).toBe(" - task")
  })
})
