import { FRONT_DESIGN_PROTOCOL } from "@shared/frontDesign"
import { describe, expect, it } from "vitest"

describe("frontDesignProtocol", () => {
  it("协议常量规范为 lx-design", () => {
    expect(FRONT_DESIGN_PROTOCOL).toBe("lx-design")
  })
})
