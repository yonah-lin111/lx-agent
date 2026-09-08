// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { useAgentChat } from "@/features/agent/hooks/useAgentChat"
import type { ChatMessage } from "@/features/agent/types"
import { parseTextWithProposedPlan, toAgentMessages } from "@/features/agent/utils"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    send: vi.fn().mockResolvedValue({ ok: true }),
    getPromptAssembly: vi
      .fn()
      .mockResolvedValue({ sections: [], contexts: [], variables: {}, rendered: "" }),
    restore: vi.fn().mockResolvedValue(undefined),
    setCollaborationMode: vi.fn().mockResolvedValue({ ok: true }),
    onEvent: vi.fn().mockReturnValue(() => {}),
    abort: vi.fn().mockResolvedValue({ ok: true }),
    getSession: vi.fn().mockResolvedValue(null),
    restoreSession: vi.fn().mockResolvedValue({ ok: true, messages: [], todos: [] }),
  },
}))

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: {
    get: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue([]),
  },
}))

describe("前端设计二次修改与提及迭代集成数据流", () => {
  beforeEach(() => {
    frontDesignStore.clear()
    vi.clearAllMocks()
  })

  it("发送包含 @design 标记时，自动注入 <referenced_design> 完整代码并透传给底层 agentApi.send", async () => {
    // 预先注册一个基准设计
    frontDesignStore.registerDesign({
      id: "design-origin",
      title: "Hero Landing",
      html: "<header class='bg-blue-600'><h1>Welcome Hero</h1></header>",
      mode: "tailwindcss",
      sessionId: "session-iter-test",
    })

    const { result } = renderHook(() =>
      useAgentChat({
        sessionId: "session-iter-test",
        tabId: "tab-iter-test",
      }),
    )

    // 用户在输入框中提及了该设计并要求二次修改
    await act(async () => {
      await result.current.sendMessage(
        "请将背景色改成深灰色：\n@design:design-origin (Hero Landing) ",
      )
    })

    expect(agentApi.send).toHaveBeenCalledTimes(1)
    const sentText = (agentApi.send as any).mock.calls[0][0]

    // 验证底层收到的文本已被扩充，包含完整 HTML 源码及引用标签
    expect(sentText).toContain(
      '<referenced_design id="design-origin" title="Hero Landing" mode="tailwindcss">',
    )
    expect(sentText).toContain("<header class='bg-blue-600'><h1>Welcome Hero</h1></header>")
    expect(sentText).toContain("</referenced_design>")
    expect(sentText).toContain("请将背景色改成深灰色：")
  })

  it("当设计在 store 中不存在时，保留原始提及文本而不抛出异常", async () => {
    const { result } = renderHook(() =>
      useAgentChat({
        sessionId: "session-iter-test",
        tabId: "tab-iter-test",
      }),
    )

    await act(async () => {
      await result.current.sendMessage("请查看 @design:non-existent (Unknown) ")
    })

    expect(agentApi.send).toHaveBeenCalledTimes(1)
    const sentText = (agentApi.send as any).mock.calls[0][0]
    expect(sentText).toBe("请查看 @design:non-existent (Unknown)")
    expect(sentText).not.toContain("<referenced_design")
  })

  it("全链路版本派生：从 parent_id 到 store 版本聚合链条", () => {
    // 1. 注册 v1
    const v1Blocks = parseTextWithProposedPlan(
      `<front_design id="d-v1" title="Dashboard"><div>Dashboard v1</div></front_design>`,
    )
    for (const b of v1Blocks) {
      if (b.kind === "frontDesign") {
        frontDesignStore.registerDesign({
          id: b.design.id,
          parentId: b.design.parentId,
          title: b.design.title,
          html: b.design.html,
        })
      }
    }

    // 2. 模拟 Agent 二次修改输出携带 parent_id="d-v1" 的 v2
    const v2Blocks = parseTextWithProposedPlan(
      `<front_design id="d-v2" parent_id="d-v1" title="Dashboard v2"><div>Dashboard v2 with Charts</div></front_design>`,
    )
    for (const b of v2Blocks) {
      if (b.kind === "frontDesign") {
        frontDesignStore.registerDesign({
          id: b.design.id,
          parentId: b.design.parentId,
          title: b.design.title,
          html: b.design.html,
        })
      }
    }

    // 3. 校验 store 的父子与版本关系
    const v1 = frontDesignStore.getDesign("d-v1")
    const v2 = frontDesignStore.getDesign("d-v2")

    expect(v1?.version).toBe(1)
    expect(v2?.version).toBe(2)
    expect(v2?.parentId).toBe("d-v1")

    expect(frontDesignStore.getParentDesign("d-v2")?.id).toBe("d-v1")
    const versionsChain = frontDesignStore.getDesignVersions("d-v1")
    expect(versionsChain.map((item) => item.id)).toEqual(["d-v1", "d-v2"])
  })

  it("发送端：包含 @design:id#target 局部选择器时，精准切片注入 global_styling_context 与 target_element", async () => {
    frontDesignStore.registerDesign({
      id: "design-sliced",
      title: "Full App Page",
      html: `<!DOCTYPE html><html class="dark"><body class="bg-slate-900 text-white"><header id="main-nav">Nav</header><main><button id="cta-button" class="btn-old">Click Me</button></main></body></html>`,
      mode: "tailwindcss",
      sessionId: "session-slice-test",
    })

    const { result } = renderHook(() =>
      useAgentChat({
        sessionId: "session-slice-test",
        tabId: "tab-slice-test",
      }),
    )

    await act(async () => {
      await result.current.sendMessage(
        "把按钮改成粉色：\n@design:design-sliced##cta-button (button#cta-button) ",
      )
    })

    expect(agentApi.send).toHaveBeenCalledTimes(1)
    const sentText = (agentApi.send as any).mock.calls[0][0]

    expect(sentText).toContain(
      '<referenced_design id="design-sliced" target="#cta-button" title="Full App Page" mode="tailwindcss">',
    )
    expect(sentText).toContain("<global_styling_context>")
    expect(sentText).toContain("theme: dark")
    expect(sentText).toContain('body_classes: "bg-slate-900 text-white"')
    expect(sentText).toContain('<target_element selector="#cta-button">')
    expect(sentText).toContain('<button id="cta-button" class="btn-old">Click Me</button>')
    // 确保没有发送数百行无关的完整页面结构（如 main-nav）
    expect(sentText).not.toContain('<header id="main-nav">Nav</header>')
  })

  it("接收端：通过 message_end 接收 <front_design_update> 自动触发 DOM 树缝合并派生新版本", async () => {
    // 1. 准备基准原型
    const baseHtml = `<!DOCTYPE html><html><body class="bg-white"><div id="content"><h1 id="title">Old Title</h1><button id="cta" class="bg-blue-500">Old CTA</button></div></body></html>`
    frontDesignStore.registerDesign({
      id: "d-base",
      title: "Original App",
      html: baseHtml,
      mode: "tailwindcss",
      sessionId: "session-dom-test",
    })

    let eventHandler: any = null
    vi.mocked(agentApi.onEvent).mockImplementation((handler: any) => {
      eventHandler = handler
      return () => {}
    })

    renderHook(() => useAgentChat(undefined, "tab-dom-test", "session-dom-test"))

    expect(eventHandler).not.toBeNull()

    // 2. 模拟 LLM 流式输出 <front_design_update> 并在 message_end 提交
    const updateSnippet = `<button id="cta" class="bg-gradient-to-r from-pink-500 to-purple-500 font-bold">New Magic CTA</button>`
    const fullAssistantMessage = `I've updated the button:
<front_design_update id="d-patch-1" parent_id="d-base" target="#cta" title="Update Magic CTA">
${updateSnippet}
</front_design_update>
Hope it looks awesome!`

    await act(async () => {
      eventHandler({
        type: "message_start",
        sessionId: "session-dom-test",
        tabId: "tab-dom-test",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "" }],
          stopReason: "pending",
          timestamp: Date.now(),
        },
      })
      eventHandler({
        type: "message_end",
        sessionId: "session-dom-test",
        tabId: "tab-dom-test",
        message: {
          role: "assistant",
          content: [{ type: "text", text: fullAssistantMessage }],
          stopReason: "end_turn",
          timestamp: Date.now(),
        },
      })
    })

    // 3. 验证 store 中自动生成并注册了拼接后的新版本
    const updatedDesign = frontDesignStore.getDesign("d-patch-1")
    expect(updatedDesign).toBeDefined()
    expect(updatedDesign?.version).toBe(2)
    expect(updatedDesign?.parentId).toBe("d-base")
    expect(updatedDesign?.title).toBe("Update Magic CTA")
    // 目标节点已替换
    expect(updatedDesign?.html).toContain("New Magic CTA")
    expect(updatedDesign?.html).toContain("bg-gradient-to-r")
    // 其余节点完整保留
    expect(updatedDesign?.html).toContain('<h1 id="title">Old Title</h1>')
    expect(updatedDesign?.html).toContain("<!DOCTYPE html>")
  })

  it("容灾拦截：当 <front_design_update> 的 target 选择器未命中时，安全拦截并不落库破损数据", async () => {
    frontDesignStore.registerDesign({
      id: "d-safe-base",
      title: "Safe Base App",
      html: `<!DOCTYPE html><html><body><div id="content">Base</div></body></html>`,
      mode: "tailwindcss",
      sessionId: "session-safe-test",
    })

    let eventHandler: any = null
    vi.mocked(agentApi.onEvent).mockImplementation((handler: any) => {
      eventHandler = handler
      return () => {}
    })

    renderHook(() => useAgentChat(undefined, "tab-safe-test", "session-safe-test"))

    const badUpdateMessage = `Updating non-existent:
<front_design_update id="d-bad-update" parent_id="d-safe-base" target="#does-not-exist" title="Bad Update">
<div>Some Fragment</div>
</front_design_update>`

    await act(async () => {
      eventHandler({
        type: "message_start",
        sessionId: "session-safe-test",
        tabId: "tab-safe-test",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "" }],
          stopReason: "pending",
          timestamp: Date.now(),
        },
      })
      eventHandler({
        type: "message_end",
        sessionId: "session-safe-test",
        tabId: "tab-safe-test",
        message: {
          role: "assistant",
          content: [{ type: "text", text: badUpdateMessage }],
          stopReason: "end_turn",
          timestamp: Date.now(),
        },
      })
    })

    // 确保没有把损坏的破损设计注册进 store
    const badDesign = frontDesignStore.getDesign("d-bad-update")
    expect(badDesign).toBeNull()
    // 基准设计未受影响
    expect(frontDesignStore.getDesign("d-safe-base")).toBeDefined()
  })

  it("二次修改时即使模型漏传 parent_id 或使用相同 title，也能自动继承前序版本并自增至 v2 / v3", () => {
    // 1. 注册初始设计 v1
    frontDesignStore.registerDesign({
      id: "design-v1-auto",
      title: "Settings Form",
      html: "<form><input name='username' /></form>",
      sessionId: "session-inherit-test",
    })
    frontDesignStore.setActiveDesignId("design-v1-auto")

    const v1 = frontDesignStore.getDesign("design-v1-auto")
    expect(v1?.version).toBe(1)

    // 2. 模拟 Agent 二次修改：生成了新 ID，具有相同 title，但遗漏了 parent_id
    frontDesignStore.registerDesign({
      id: "design-v2-auto",
      title: "Settings Form",
      html: "<form><input name='username' /><input name='email' /></form>",
      sessionId: "session-inherit-test",
    })

    const v2 = frontDesignStore.getDesign("design-v2-auto")
    expect(v2).toBeDefined()
    expect(v2?.version).toBe(2)
    expect(v2?.parentId).toBe("design-v1-auto")

    // 验证版本族链条
    const versions = frontDesignStore.getDesignVersions("design-v1-auto")
    expect(versions.map((v) => v.version)).toEqual([1, 2])
    expect(versions.map((v) => v.id)).toEqual(["design-v1-auto", "design-v2-auto"])

    // 3. 模拟第三次修改，继续自增至 v3
    frontDesignStore.setActiveDesignId("design-v2-auto")
    frontDesignStore.registerDesign({
      id: "design-v3-auto",
      title: "Settings Form",
      html: "<form><input name='username' /><input name='email' /><button>Save</button></form>",
      sessionId: "session-inherit-test",
    })

    const v3 = frontDesignStore.getDesign("design-v3-auto")
    expect(v3).toBeDefined()
    expect(v3?.version).toBe(3)
    expect(v3?.parentId).toBe("design-v2-auto")

    const versionsV3 = frontDesignStore.getDesignVersions("design-v1-auto")
    expect(versionsV3.map((v) => v.version)).toEqual([1, 2, 3])
  })

  it("模型二次修改复用旧 ID 时，流式及最终阶段自动派生新版本 ID（-v2, -v3），杜绝覆盖 v1", () => {
    // 1. 第一轮生成设计（初始 v1，已完成）
    frontDesignStore.registerDesign({
      id: "landing-hero",
      title: "Landing Hero",
      html: "<section><h1>Version 1 Hero</h1></section>",
      isStreaming: false,
      sessionId: "session-same-id",
    })

    const v1 = frontDesignStore.getDesign("landing-hero")
    expect(v1).toBeDefined()
    expect(v1?.version).toBe(1)
    expect(v1?.html).toBe("<section><h1>Version 1 Hero</h1></section>")

    // 2. 第二轮：模型二次修改时复用了相同的 id="landing-hero"，开始流式回传
    // Chunk 1（流式中）：应派生出 landing-hero-v2，且 parentId 关联至 landing-hero
    frontDesignStore.registerDesign({
      id: "landing-hero",
      title: "Landing Hero",
      html: "<section><h1>Version 2 Hero",
      isStreaming: true,
      sessionId: "session-same-id",
    })

    const v2Streaming = frontDesignStore.getDesign("landing-hero-v2")
    expect(v2Streaming).toBeDefined()
    expect(v2Streaming?.isStreaming).toBe(true)
    expect(v2Streaming?.version).toBe(2)
    expect(v2Streaming?.parentId).toBe("landing-hero")
    expect(v2Streaming?.html).toBe("<section><h1>Version 2 Hero")

    // 原始 v1 绝不受破坏
    const v1Preserved = frontDesignStore.getDesign("landing-hero")
    expect(v1Preserved?.html).toBe("<section><h1>Version 1 Hero</h1></section>")
    expect(v1Preserved?.version).toBe(1)

    // Chunk 2（流式中后续数据段到达）：就地更新 landing-hero-v2，绝不产生重复项或覆盖 v1
    frontDesignStore.registerDesign({
      id: "landing-hero",
      title: "Landing Hero",
      html: "<section><h1>Version 2 Hero</h1><p>Subtitle</p></section>",
      isStreaming: true,
      sessionId: "session-same-id",
    })

    const v2Updated = frontDesignStore.getDesign("landing-hero-v2")
    expect(v2Updated?.html).toBe("<section><h1>Version 2 Hero</h1><p>Subtitle</p></section>")
    expect(v2Updated?.version).toBe(2)

    // message_end（流式结束）：完成落盘，更新 landing-hero-v2 为 isStreaming: false
    frontDesignStore.registerDesign({
      id: "landing-hero",
      title: "Landing Hero",
      html: "<section><h1>Version 2 Hero</h1><p>Subtitle</p></section>",
      isStreaming: false,
      sessionId: "session-same-id",
    })

    const v2Final = frontDesignStore.getDesign("landing-hero-v2")
    expect(v2Final?.isStreaming).toBe(false)
    expect(v2Final?.version).toBe(2)

    // 3. 第三轮：再次基于 landing-hero 复用 ID 进行流式修改
    frontDesignStore.registerDesign({
      id: "landing-hero",
      title: "Landing Hero",
      html: "<section><h1>Version 3 Hero Final</h1></section>",
      isStreaming: true,
      sessionId: "session-same-id",
    })
    frontDesignStore.registerDesign({
      id: "landing-hero",
      title: "Landing Hero",
      html: "<section><h1>Version 3 Hero Final</h1></section>",
      isStreaming: false,
      sessionId: "session-same-id",
    })

    const v3Final = frontDesignStore.getDesign("landing-hero-v3")
    expect(v3Final).toBeDefined()
    expect(v3Final?.version).toBe(3)
    expect(v3Final?.parentId).toBe("landing-hero-v2")

    // 验证版本链完整涵盖 v1, v2, v3
    const allVersions = frontDesignStore.getDesignVersions("landing-hero")
    expect(allVersions.map((v) => v.version)).toEqual([1, 2, 3])
    expect(allVersions.map((v) => v.id)).toEqual([
      "landing-hero",
      "landing-hero-v2",
      "landing-hero-v3",
    ])
  })

  it("同一会话内存在多个独立设计时，各自独立维护版本链，互不干扰", () => {
    // 设计 A: Login Page
    frontDesignStore.registerDesign({
      id: "design-login",
      title: "Login Page",
      html: "<form>Login</form>",
      sessionId: "session-multi",
    })

    // 设计 B: Dashboard Page
    frontDesignStore.registerDesign({
      id: "design-dashboard",
      title: "Dashboard Page",
      html: "<div>Dashboard</div>",
      sessionId: "session-multi",
    })

    // 根设计应有两个独立设计
    const roots = frontDesignStore.getRootDesigns("session-multi")
    expect(roots.length).toBe(2)
    expect(roots.map((r) => r.id)).toEqual(["design-dashboard", "design-login"])

    // 对设计 A 进行二次修改
    frontDesignStore.registerDesign({
      id: "design-login-v2",
      parentId: "design-login",
      title: "Login Page",
      html: "<form>Login v2 with OAuth</form>",
      sessionId: "session-multi",
    })

    // 验证设计 A 具有 2 个版本，设计 B 仍为 1 个版本
    const loginVersions = frontDesignStore.getDesignVersions("design-login")
    expect(loginVersions.map((v) => v.version)).toEqual([1, 2])

    const dashboardVersions = frontDesignStore.getDesignVersions("design-dashboard")
    expect(dashboardVersions.map((v) => v.version)).toEqual([1])
  })

  it("toAgentMessages 逆向序列化无损保留 frontDesign、proposedPlan 与 reviewFindings 原始文本", () => {
    const rawDesign = `<front_design id="d-undo-test" title="Login">\n<form>Login</form>\n</front_design>`
    const rawPlan = `<proposed_plan>\n{"summary": "test plan"}\n</proposed_plan>`
    const rawFindings = `<review_findings>\nSummary\n</review_findings>`

    const chatMessage: ChatMessage = {
      id: "msg-assistant-1",
      role: "assistant",
      isStreaming: false,
      blocks: [
        { kind: "text", text: "Here is your design and plan:" },
        {
          kind: "frontDesign",
          design: {
            id: "d-undo-test",
            title: "Login",
            html: "<form>Login</form>",
            raw: rawDesign,
          },
        },
        {
          kind: "proposedPlan",
          plan: {
            summary: "test plan",
            raw: rawPlan,
          },
        },
        {
          kind: "reviewFindings",
          findings: {
            summary: "test findings",
            findings: [],
            raw: rawFindings,
          },
        },
      ],
    }

    const agentMessages = toAgentMessages([chatMessage])
    expect(agentMessages).toHaveLength(1)
    const assistantMsg = agentMessages[0]
    expect(assistantMsg.role).toBe("assistant")

    const contentBlocks = assistantMsg.content as Array<{ type: string; text?: string }>
    expect(contentBlocks).toHaveLength(4)
    expect(contentBlocks[0].text).toBe("Here is your design and plan:")
    expect(contentBlocks[1].text).toBe(rawDesign)
    expect(contentBlocks[2].text).toBe(rawPlan)
    expect(contentBlocks[3].text).toBe(rawFindings)
  })
})
