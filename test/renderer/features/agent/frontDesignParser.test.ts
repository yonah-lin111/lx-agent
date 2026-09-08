// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import type { ChatBlock } from "@/features/agent/types"
import { parseTextWithProposedPlan } from "@/features/agent/utils"

const syncBlocksToStore = (blocks: ChatBlock[], sessionId?: string, autoActivate = false): void => {
  for (const b of blocks) {
    if (b.kind === "frontDesign") {
      frontDesignStore.registerDesign({
        id: b.design.id,
        parentId: b.design.parentId,
        title: b.design.title,
        html: b.design.html,
        isStreaming: b.design.isStreaming,
        sessionId,
        autoActivate,
      })
    }
  }
}

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
    syncBlocksToStore(blocks)
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

    syncBlocksToStore(blocks)
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

    syncBlocksToStore(blocks1, undefined, true)
    syncBlocksToStore(blocks2, undefined, true)

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

    // 再次解析并同步 msg2，不应粗暴冲刷覆盖当前激活的历史设计 1
    syncBlocksToStore(parseTextWithProposedPlan(msg2, undefined, "msg-2"))
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

    syncBlocksToStore(blocks)
    expect(frontDesignStore.getAllDesigns().length).toBe(2)
  })

  it("支持解析 parent_id / parentId 并构建版本派生链", () => {
    const v1Raw = `<front_design id="card-v1" title="Pricing Card"><p>Plan 1</p></front_design>`
    const v2Raw = `<front_design id="card-v2" parent_id="card-v1" title="Pricing Card (Updated)"><p>Plan 2</p></front_design>`
    const v3Raw = `<front_design id="card-v3" parent_id="card-v2" title="Pricing Card (Final)"><p>Plan 3</p></front_design>`

    const b1 = parseTextWithProposedPlan(v1Raw)
    const b2 = parseTextWithProposedPlan(v2Raw)
    const b3 = parseTextWithProposedPlan(v3Raw)

    expect(b2[0].kind === "frontDesign" && b2[0].design.parentId).toBe("card-v1")
    expect(b3[0].kind === "frontDesign" && b3[0].design.parentId).toBe("card-v2")

    syncBlocksToStore(b1)
    syncBlocksToStore(b2)
    syncBlocksToStore(b3)

    const v1 = frontDesignStore.getDesign("card-v1")
    const v2 = frontDesignStore.getDesign("card-v2")
    const v3 = frontDesignStore.getDesign("card-v3")

    expect(v1?.version).toBe(1)
    expect(v2?.version).toBe(2)
    expect(v3?.version).toBe(3)

    // 校验版本查询
    const versions = frontDesignStore.getDesignVersions("card-v2")
    expect(versions.map((v) => v.id)).toEqual(["card-v1", "card-v2", "card-v3"])
  })

  it("正确解析 <front_design_update parent_id=... target=...> 定向局部更新块", () => {
    const raw = `I will now update your button:
<front_design_update id="btn-update-1" parent_id="card-v1" target="#cta-button" title="Update CTA">
<button id="cta-button" class="bg-purple-600 font-bold">New CTA</button>
</front_design_update>
Done!`

    const blocks = parseTextWithProposedPlan(raw)
    expect(blocks.length).toBe(3)
    expect(blocks[0]).toEqual({ kind: "text", text: "I will now update your button:" })
    expect(blocks[1].kind).toBe("frontDesign")

    if (blocks[1].kind === "frontDesign") {
      expect(blocks[1].design.id).toBe("btn-update-1")
      expect(blocks[1].design.parentId).toBe("card-v1")
      expect(blocks[1].design.target).toBe("#cta-button")
      expect(blocks[1].design.isUpdate).toBe(true)
      expect(blocks[1].design.title).toBe("Update CTA")
      expect(blocks[1].design.html).toBe(
        '<button id="cta-button" class="bg-purple-600 font-bold">New CTA</button>',
      )
      expect(blocks[1].design.isStreaming).toBe(false)
    }

    expect(blocks[2]).toEqual({ kind: "text", text: "Done!" })
  })

  it("流式生成中正确捕获未闭合的 <front_design_update> 块", () => {
    const raw = `Updating header:
<front_design_update parent_id="base-1" target="#header">
<header class="p-4 bg-zinc-900">`

    const blocks = parseTextWithProposedPlan(raw)
    expect(blocks.length).toBe(2)
    expect(blocks[1].kind).toBe("frontDesign")

    if (blocks[1].kind === "frontDesign") {
      expect(blocks[1].design.parentId).toBe("base-1")
      expect(blocks[1].design.target).toBe("#header")
      expect(blocks[1].design.isUpdate).toBe(true)
      expect(blocks[1].design.isStreaming).toBe(true)
      expect(blocks[1].design.html).toBe('<header class="p-4 bg-zinc-900">')
    }
  })

  it('正确容忍并解析 LLM 输出带嵌套引号的 target 选择器（如 target="[data-design-id="el-123"]"）', () => {
    const raw = `<front_design_update parent_id="m3-design-4" target="[data-design-id="el-mtrcy5qv-g3m64"]" title="更换图标">
<svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24"><path d="M12 12"/></svg>
</front_design_update>`

    const blocks = parseTextWithProposedPlan(raw)
    expect(blocks.length).toBe(1)
    expect(blocks[0].kind).toBe("frontDesign")
    if (blocks[0].kind === "frontDesign") {
      expect(blocks[0].design.parentId).toBe("m3-design-4")
      // 校验属性提取不仅未被中途截断，且去除了容易导致 HTML 错乱的内嵌引号
      expect(blocks[0].design.target).toBe("[data-design-id=el-mtrcy5qv-g3m64]")
      expect(blocks[0].design.title).toBe("更换图标")
      expect(blocks[0].design.isUpdate).toBe(true)
    }
  })
})
