// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { parseTextWithProposedPlan } from "@/features/agent/utils"

describe("Front Design 协议流式解析与 Store 联动", () => {
  beforeEach(() => {
    frontDesignStore.clear()
  })

  it("正确提取完整的 <front_design> 块并同步至 frontDesignStore", () => {
    const raw = `Here is your landing page design:
<front_design title="Hero Banner">
<div class="p-6 bg-zinc-900 text-white">
  <h1 class="text-2xl font-bold">Welcome</h1>
</div>
</front_design>
Hope you like it!`

    const blocks = parseTextWithProposedPlan(raw)

    expect(blocks.length).toBe(3)
    expect(blocks[0]).toEqual({ kind: "text", text: "Here is your landing page design:" })
    expect(blocks[1].kind).toBe("frontDesign")

    if (blocks[1].kind === "frontDesign") {
      expect(blocks[1].design.title).toBe("Hero Banner")
      expect(blocks[1].design.html).toContain('<div class="p-6 bg-zinc-900 text-white">')
      expect(blocks[1].design.isStreaming).toBe(false)
    }

    expect(blocks[2]).toEqual({ kind: "text", text: "Hope you like it!" })

    // 校验 store 同步
    const storeState = frontDesignStore.getState()
    expect(storeState.title).toBe("Hero Banner")
    expect(storeState.html).toContain("Welcome")
    expect(storeState.isStreaming).toBe(false)
  })

  it("流式生成中（未闭合标签）正确标记 isStreaming 并在 store 中实时反映", () => {
    const raw = `Generating UI:
<front_design title="Navbar">
<nav class="flex items-center">`

    const blocks = parseTextWithProposedPlan(raw)

    expect(blocks.length).toBe(2)
    expect(blocks[0]).toEqual({ kind: "text", text: "Generating UI:" })
    expect(blocks[1].kind).toBe("frontDesign")

    if (blocks[1].kind === "frontDesign") {
      expect(blocks[1].design.title).toBe("Navbar")
      expect(blocks[1].design.isStreaming).toBe(true)
    }

    const storeState = frontDesignStore.getState()
    expect(storeState.title).toBe("Navbar")
    expect(storeState.isStreaming).toBe(true)
  })
})
