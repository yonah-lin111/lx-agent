// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import type { DesignSystemTokens } from "@/features/agent/hooks/designSystemStore"
import {
  buildDesignReferenceBlocks,
  buildDesignSystemBlock,
  type DesignReferenceCandidate,
} from "@/features/agent/utils/designReferenceInjection"

const TOKENS: DesignSystemTokens = {
  colors: ["#ec4899", "#0b0f19"],
  radius: "8px",
  fontFamily: "Inter, sans-serif",
  notes: "卡片统一 rounded-lg border",
}

const EMPTY_TOKENS: DesignSystemTokens = {
  colors: [],
  radius: "",
  fontFamily: "",
  notes: "",
}

const DESIGN: DesignReferenceCandidate = {
  id: "d1",
  title: "Login",
  html: "<!DOCTYPE html><html><head></head><body><main><h1>Hi</h1></main></body></html>",
  mode: "tailwindcss",
  sessionId: null,
  version: 3,
}

const resolveDesign = (): DesignReferenceCandidate => DESIGN

describe("设计系统令牌注入", () => {
  it("design 模式且令牌非空时生成块，并排在设计块之前", () => {
    const blocks = buildDesignReferenceBlocks("把标题改大", {
      collaborationMode: "design",
      currentSessionId: "s1",
      activeDesign: DESIGN,
      resolveDesign,
      designTokens: TOKENS,
    })

    expect(blocks.length).toBeGreaterThanOrEqual(2)
    expect(blocks[0].startsWith("<design_system>")).toBe(true)
    expect(blocks[0]).toContain("colors: #ec4899, #0b0f19")
    expect(blocks[0]).toContain("radius: 8px")
    expect(blocks[0]).toContain("font-family: Inter, sans-serif")
    expect(blocks[0]).toContain("notes: 卡片统一 rounded-lg border")
    expect(blocks[1]).toContain("<current_design")
  })

  it("显式 @design 引用时同样先注入令牌块", () => {
    const blocks = buildDesignReferenceBlocks("@design:d1 (Login) 改按钮", {
      collaborationMode: "design",
      currentSessionId: "s1",
      activeDesign: null,
      resolveDesign,
      designTokens: TOKENS,
    })

    expect(blocks[0].startsWith("<design_system>")).toBe(true)
    expect(blocks.some((block) => block.includes("<referenced_design"))).toBe(true)
  })

  it("非 design 模式不注入令牌块", () => {
    const blocks = buildDesignReferenceBlocks("@design:d1 改按钮", {
      collaborationMode: "build",
      currentSessionId: "s1",
      activeDesign: DESIGN,
      resolveDesign,
      designTokens: TOKENS,
    })

    expect(blocks.some((block) => block.includes("<design_system>"))).toBe(false)
  })

  it("空令牌时既不生成块也不改变原有注入", () => {
    expect(buildDesignSystemBlock("design", EMPTY_TOKENS)).toBeNull()
    const blocks = buildDesignReferenceBlocks("把标题改大", {
      collaborationMode: "design",
      currentSessionId: "s1",
      activeDesign: DESIGN,
      resolveDesign,
      designTokens: EMPTY_TOKENS,
    })
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain("<current_design")
  })

  it("空字段仅省略对应行", () => {
    const block = buildDesignSystemBlock("design", {
      colors: [],
      radius: "4px",
      fontFamily: "",
      notes: "",
    })
    expect(block).toContain("radius: 4px")
    expect(block).not.toContain("colors:")
    expect(block).not.toContain("font-family:")
    expect(block).not.toContain("notes:")
  })
})
