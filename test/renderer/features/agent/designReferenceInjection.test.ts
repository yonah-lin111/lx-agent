// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  type BuildDesignReferenceBlocksOptions,
  buildDesignReferenceBlocks,
  type DesignReferenceCandidate,
} from "@/features/agent/utils/designReferenceInjection"

const activeDesign: DesignReferenceCandidate = {
  id: "design-1",
  title: "登录页",
  html: "<body class='bg-zinc-950'>Login</body>",
  mode: "tailwindcss",
  sessionId: "session-1",
  version: 2,
}

const makeOptions = (
  overrides: Partial<BuildDesignReferenceBlocksOptions> = {},
): BuildDesignReferenceBlocksOptions => ({
  collaborationMode: "design",
  currentSessionId: "session-1",
  activeDesign,
  resolveDesign: () => null,
  ...overrides,
})

describe("buildDesignReferenceBlocks", () => {
  it("design 模式无显式引用时注入 <current_design> 修改基线", () => {
    const blocks = buildDesignReferenceBlocks("把主按钮改成圆角", makeOptions())

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain('<current_design id="design-1"')
    expect(blocks[0]).toContain('title="登录页"')
    expect(blocks[0]).toContain('mode="tailwindcss"')
    expect(blocks[0]).toContain('version="2"')
    expect(blocks[0]).toContain("<body class='bg-zinc-950'>Login</body>")
    expect(blocks[0]).toContain("</current_design>")
  })

  it("存在显式 @design 引用时显式优先，不注入 current_design", () => {
    const blocks = buildDesignReferenceBlocks(
      "@design:design-2 (落地页) 改成圆角",
      makeOptions({
        resolveDesign: (id) =>
          id === "design-2"
            ? { id: "design-2", title: "落地页", html: "<main>Landing</main>", mode: "css" }
            : null,
      }),
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain('<referenced_design id="design-2"')
    expect(blocks[0]).toContain('mode="css"')
    expect(blocks[0]).not.toContain("current_design")
  })

  it("非 design 模式且无显式引用时不注入任何块", () => {
    expect(buildDesignReferenceBlocks("你好", makeOptions({ collaborationMode: "build" }))).toEqual(
      [],
    )
  })

  it("激活设计绑定其他会话时不注入，避免跨会话拿错基线", () => {
    expect(
      buildDesignReferenceBlocks("改一下", makeOptions({ currentSessionId: "session-9" })),
    ).toEqual([])
  })

  it("草稿设计（无 sessionId）放行注入", () => {
    const blocks = buildDesignReferenceBlocks(
      "改一下",
      makeOptions({
        activeDesign: { ...activeDesign, sessionId: null },
        currentSessionId: null,
      }),
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain('<current_design id="design-1"')
  })

  it("显式引用不存在时静默跳过，不产生任何注入", () => {
    expect(buildDesignReferenceBlocks("@design:none (Unknown) 改一下", makeOptions())).toEqual([])
  })

  it("带 target 的显式引用注入切片上下文而非全量页面", () => {
    const html = `<!DOCTYPE html><html class="dark"><body class="bg-slate-900"><header id="nav">Nav</header><button id="cta" class="old">Go</button></body></html>`
    const blocks = buildDesignReferenceBlocks(
      "@design:design-3##cta (button#cta) 改成粉色",
      makeOptions({
        resolveDesign: () => ({ id: "design-3", title: "App", html, mode: "tailwindcss" }),
      }),
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain('<referenced_design id="design-3" target="#cta"')
    expect(blocks[0]).toContain("<global_styling_context>")
    expect(blocks[0]).toContain('<target_element selector="#cta">')
    expect(blocks[0]).toContain('<button id="cta" class="old">Go</button>')
    expect(blocks[0]).not.toContain('<header id="nav">Nav</header>')
  })

  it("target 未命中时降级为全量注入", () => {
    const blocks = buildDesignReferenceBlocks(
      "@design:design-3##missing (none) 改一下",
      makeOptions({
        resolveDesign: () => ({
          id: "design-3",
          title: "App",
          html: "<div id='real'>x</div>",
          mode: "tailwindcss",
        }),
      }),
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain('<referenced_design id="design-3" title="App" mode="tailwindcss">')
    expect(blocks[0]).not.toContain("target=")
  })
})
