import { describe, expect, it } from "vitest"
import { createRegistry } from "@/agent/assembly"

// 说明：本文件不 mock electron（assembly 链会加载 shell 等模块），
// createViewImageTool 仅在 execute 时使用 nativeImage，门控测试只关心注册/激活集。
describe("view_image 装配门控", () => {
  it("视觉模型：注册并激活 view_image", () => {
    const registry = createRegistry(
      process.cwd(),
      ["read", "view_image"],
      [],
      false,
      undefined,
      undefined,
      undefined,
      { getSessionId: () => null, supportsImages: () => true },
    )
    expect(registry.getAll().map((tool) => tool.name)).toContain("view_image")
    expect(registry.getActive().map((tool) => tool.name)).toContain("view_image")
  })

  it("非视觉模型：不注册且不激活 view_image", () => {
    const registry = createRegistry(
      process.cwd(),
      ["read", "view_image"],
      [],
      false,
      undefined,
      undefined,
      undefined,
      { getSessionId: () => null, supportsImages: () => false },
    )
    expect(registry.getAll().map((tool) => tool.name)).not.toContain("view_image")
    expect(registry.getActive().map((tool) => tool.name)).toEqual(["read"])
  })

  it("缺省（无 sessionDeps）时保持注册激活，向后兼容", () => {
    const registry = createRegistry(process.cwd(), ["view_image"], [], false)
    expect(registry.getActive().map((tool) => tool.name)).toContain("view_image")
  })
})
