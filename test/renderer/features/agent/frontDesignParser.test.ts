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

  it("支持多个设计共存，各自分配稳定唯一 ID，并可在历史设计间自由切换", () => {
    const msg1 = `<front_design title="Page 1"><p>Content 1</p></front_design>`
    const msg2 = `<front_design title="Page 2"><p>Content 2</p></front_design>`

    const blocks1 = parseTextWithProposedPlan(msg1, undefined, "msg-1")
    const blocks2 = parseTextWithProposedPlan(msg2, undefined, "msg-2")

    const design1 = blocks1[0].kind === "frontDesign" ? blocks1[0].design : null
    const design2 = blocks2[0].kind === "frontDesign" ? blocks2[0].design : null

    expect(design1).not.toBeNull()
    expect(design2).not.toBeNull()
    expect(design1?.id).toBe("msg-1-design-0")
    expect(design2?.id).toBe("msg-2-design-0")

    const storeState = frontDesignStore.getState()
    expect(storeState.designs.length).toBe(2)
    // 默认展示最新添加的设计
    expect(storeState.activeDesignId).toBe("msg-2-design-0")
    expect(storeState.title).toBe("Page 2")

    // 自由切换到历史设计 1
    frontDesignStore.setActiveDesignId("msg-1-design-0")
    const switchedState = frontDesignStore.getState()
    expect(switchedState.activeDesignId).toBe("msg-1-design-0")
    expect(switchedState.title).toBe("Page 1")
    expect(switchedState.html).toBe("<p>Content 1</p>")

    // 再次解析 msg2（模拟消息列表重渲染），不应粗暴冲刷覆盖当前激活的历史设计 1
    parseTextWithProposedPlan(msg2, undefined, "msg-2")
    const preservedState = frontDesignStore.getState()
    expect(preservedState.activeDesignId).toBe("msg-1-design-0")
    expect(preservedState.title).toBe("Page 1")

    // 删除设计 1 后自动降级激活剩余设计
    frontDesignStore.removeDesign("msg-1-design-0")
    const afterDeleteState = frontDesignStore.getState()
    expect(afterDeleteState.designs.length).toBe(1)
    expect(afterDeleteState.activeDesignId).toBe("msg-2-design-0")
    expect(afterDeleteState.title).toBe("Page 2")
  })

  it("支持单条消息内多个设计以及标签自定义 id 属性解析", () => {
    const raw = `Header:
<front_design id="header-v1" title="App Header">
<header>Header Content</header>
</front_design>
Footer:
<front_design id="footer-v1" title="App Footer">
<footer>Footer Content</footer>
</front_design>`

    const blocks = parseTextWithProposedPlan(raw, undefined, "turn-1")
    const designBlocks = blocks.filter((b) => b.kind === "frontDesign")
    expect(designBlocks.length).toBe(2)

    if (designBlocks[0].kind === "frontDesign" && designBlocks[1].kind === "frontDesign") {
      expect(designBlocks[0].design.id).toBe("header-v1")
      expect(designBlocks[0].design.title).toBe("App Header")
      expect(designBlocks[1].design.id).toBe("footer-v1")
      expect(designBlocks[1].design.title).toBe("App Footer")
    }

    expect(frontDesignStore.getAllDesigns().length).toBe(2)
  })
})
