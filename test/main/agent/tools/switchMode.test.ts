import { describe, expect, it, vi } from "vitest"
import { createSwitchModeTool } from "@/agent/tools/switchMode"

describe("switch_mode tool", () => {
  it("should switch mode to plan and trigger callback", async () => {
    const onSwitchMode = vi.fn()
    const tool = createSwitchModeTool({ onSwitchMode })

    const result = await tool.execute("call-1", {
      mode: "plan",
      reason: "Needs complex architectural design",
    })

    expect(onSwitchMode).toHaveBeenCalledWith("plan")
    expect((result.content[0] as any).text).toContain("Successfully switched collaboration mode to 'plan'")
  })

  it("should switch mode to default and trigger callback", async () => {
    const onSwitchMode = vi.fn()
    const tool = createSwitchModeTool({ onSwitchMode })

    const result = await tool.execute("call-2", {
      mode: "default",
      reason: "Plan completed, executing code",
    })

    expect(onSwitchMode).toHaveBeenCalledWith("default")
    expect((result.content[0] as any).text).toContain("Successfully switched collaboration mode to 'default'")
  })
})
