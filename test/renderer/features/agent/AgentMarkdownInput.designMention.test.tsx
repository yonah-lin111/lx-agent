// @vitest-environment jsdom
import { markdown } from "@codemirror/lang-markdown"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import { cleanup } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  extractDesignMentions,
  getDesignMentionDeletionRange,
} from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"
import { markdownMarkerHighlight } from "@/features/markdown/extensions/markdownEditorExtensions"

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: {
    get: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue([]),
  },
}))

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

vi.stubGlobal("requestAnimationFrame", ((cb: () => void) => {
  cb()
  return 0
}) as typeof requestAnimationFrame)

const collectDecoratedRangesAndClasses = (
  source: string,
): { text: string; className: string }[] => {
  const extension = markdownMarkerHighlight()
  const pluginSpec = extension[0]!
  const state = EditorState.create({
    doc: source,
    extensions: [markdown({ extensions: [GFM] }), extension],
  })
  const view = new EditorView({ state })
  const plugin = view.plugin(pluginSpec)
  const results: { text: string; className: string }[] = []
  if (plugin) {
    const cursor = plugin.decorations.iter()
    while (cursor.value) {
      results.push({
        text: view.state.doc.sliceString(cursor.from, cursor.to),
        className: (cursor.value.spec as any)?.class ?? "",
      })
      cursor.next()
    }
  }
  return results
}

describe("extractDesignMentions 正则提取能力", () => {
  it("正确提取带有属性选择器和标签的完整 design token", () => {
    const text = "请修改 @design:m3-design-0#[data-design-id=el-mtskupgn-z00g6] (span) 的文案"
    const mentions = extractDesignMentions(text)

    expect(mentions).toHaveLength(1)
    expect(mentions[0]).toMatchObject({
      id: "m3-design-0",
      target: "[data-design-id=el-mtskupgn-z00g6]",
      title: "span",
      fullMatch: "@design:m3-design-0#[data-design-id=el-mtskupgn-z00g6] (span)",
      start: 4,
      end: 65,
    })
  })

  it("正确提取带 ID/Class 选择器的 design token", () => {
    const text = "@design:v1-card#btn-submit (Submit Button)"
    const mentions = extractDesignMentions(text)

    expect(mentions).toHaveLength(1)
    expect(mentions[0]).toMatchObject({
      id: "v1-card",
      target: "btn-submit",
      title: "Submit Button",
      fullMatch: "@design:v1-card#btn-submit (Submit Button)",
      start: 0,
      end: 42,
    })
  })

  it("正确提取基础原型 token（无 target，带 title）", () => {
    const text = "参考 @design:proto-01 (Frontend Prototype) 进行重构"
    const mentions = extractDesignMentions(text)

    expect(mentions).toHaveLength(1)
    expect(mentions[0]).toMatchObject({
      id: "proto-01",
      target: undefined,
      title: "Frontend Prototype",
      fullMatch: "@design:proto-01 (Frontend Prototype)",
      start: 3,
      end: 40,
    })
  })

  it("正确提取极简 ID token 与纯选择器 token", () => {
    const text = "@design:card-99 @design:card-100#[data-section=hero]"
    const mentions = extractDesignMentions(text)

    expect(mentions).toHaveLength(2)
    expect(mentions[0]).toMatchObject({
      id: "card-99",
      target: undefined,
      title: undefined,
      fullMatch: "@design:card-99",
    })
    expect(mentions[1]).toMatchObject({
      id: "card-100",
      target: "[data-section=hero]",
      title: undefined,
      fullMatch: "@design:card-100#[data-section=hero]",
    })
  })

  it("前缀为字母或数字时不误匹配（如邮箱格式）", () => {
    const text = "test@design:not-a-token and [email]abc@design:fail"
    const mentions = extractDesignMentions(text)
    expect(mentions).toHaveLength(0)
  })
})

describe("getDesignMentionDeletionRange 快速删除范围计算", () => {
  const fullTokenText = "查看 @design:m3-design-0#[data-design-id=el-mtskupgn-z00g6] (span) "

  it("光标在末尾空格之后时整块删除（包含尾随空格）", () => {
    const cursor = fullTokenText.length // 光标在末尾空格后
    const range = getDesignMentionDeletionRange(fullTokenText, cursor)

    expect(range).toEqual({
      from: 3,
      to: cursor,
    })
  })

  it("光标紧贴右括号末尾时整块删除（若后随空格一并移除）", () => {
    const tokenNoTrailingSpace =
      "查看 @design:m3-design-0#[data-design-id=el-mtskupgn-z00g6] (span)"
    const cursor = tokenNoTrailingSpace.length
    const range = getDesignMentionDeletionRange(tokenNoTrailingSpace, cursor)

    expect(range).toEqual({
      from: 3,
      to: cursor,
    })
  })

  it("光标处于 Token 内部时不触发整块删除（降级为单字符编辑）", () => {
    // 光标位于 (sp|an) 内部
    const cursorInside = fullTokenText.indexOf("(span)") + 3
    const range = getDesignMentionDeletionRange(fullTokenText, cursorInside)

    expect(range).toBeNull()
  })

  it("光标在普通文本处时不触发整块删除", () => {
    const text = "@design:m3-design-0 (span) 普通文字"
    const cursorAtEnd = text.length
    const range = getDesignMentionDeletionRange(text, cursorAtEnd)

    expect(range).toBeNull()
  })

  it("多个 design token 时仅删除光标当前紧邻的那一个", () => {
    const multiText = "@design:id1 (One) @design:id2 (Two) "
    const cursorAtEnd = multiText.length
    const range = getDesignMentionDeletionRange(multiText, cursorAtEnd)

    // 应该只删除 @design:id2 (Two)
    expect(range).toEqual({
      from: 18,
      to: multiText.length,
    })
  })
})

describe("AgentMarkdownInput 中 Design 模式高亮渲染", () => {
  it("将 @design:...#[...] (span) 标记为 cm-md-design-mention", () => {
    const source = "请注意 @design:m3-design-0#[data-design-id=el-mtskupgn-z00g6] (span) 的实现"
    const decorations = collectDecoratedRangesAndClasses(source)

    const designDeco = decorations.find((d) => d.className.includes("cm-md-design-mention"))
    expect(designDeco).toBeDefined()
    expect(designDeco?.text).toBe("@design:m3-design-0#[data-design-id=el-mtskupgn-z00g6] (span)")

    // 验证 @design 不会被误标记为文件提及 cm-md-file-mention
    const fileDecos = decorations.filter((d) => d.className.includes("cm-md-file-mention"))
    expect(fileDecos.some((d) => d.text.includes("@design"))).toBe(false)
  })

  it("极简 ID 模式同样生效 cm-md-design-mention", () => {
    const source = "@design:card-prototype-1"
    const decorations = collectDecoratedRangesAndClasses(source)

    const designDeco = decorations.find((d) => d.className.includes("cm-md-design-mention"))
    expect(designDeco).toBeDefined()
    expect(designDeco?.text).toBe("@design:card-prototype-1")
  })

  it("design token 内部的括号与连字符不会被污染为 cm-md-link-marker", () => {
    const source = "@design:proto#[target] (button)"
    const decorations = collectDecoratedRangesAndClasses(source)

    const linkMarkersInside = decorations.filter(
      (d) => d.className.includes("cm-md-link-marker") && (d.text === "[" || d.text === "("),
    )
    expect(linkMarkersInside).toHaveLength(0)
  })
})

describe("AgentMarkdownInput 真实组件 Backspace 快速删除测试", () => {
  afterEach(cleanup)

  it("光标在 @design:... (span) 末尾空格后按下 Backspace，一键整块删除", async () => {
    const { render, act, fireEvent } = await import("@testing-library/react")
    const { useState } = await import("react")
    const { AgentMarkdownInput } = await import(
      "@/features/agent/components/AgentInput/AgentMarkdownInput"
    )

    const refHolder = { current: null as any }
    let currentVal = "@design:m3-design-0#[data-design-id=el-mtskupgn-z00g6] (span) "

    const Harness = () => {
      const [val, setVal] = useState(currentVal)
      return (
        <AgentMarkdownInput
          ref={(node) => {
            refHolder.current = node
          }}
          value={val}
          onChange={(newVal) => {
            currentVal = newVal
            setVal(newVal)
          }}
          onSend={() => {}}
        />
      )
    }

    render(<Harness />)
    await act(async () => {})

    refHolder.current?.setSelectionRange(currentVal.length, currentVal.length)
    const editor = document.querySelector(".cm-content") as HTMLElement
    expect(editor).not.toBeNull()

    // 触发 Backspace
    fireEvent.keyDown(editor, { key: "Backspace" })
    expect(currentVal).toBe("")
  })

  it("光标在 @design:... (span) 紧贴右括号后按下 Backspace，一键整块删除", async () => {
    const { render, act, fireEvent } = await import("@testing-library/react")
    const { useState } = await import("react")
    const { AgentMarkdownInput } = await import(
      "@/features/agent/components/AgentInput/AgentMarkdownInput"
    )

    const refHolder = { current: null as any }
    let currentVal = "@design:m3-design-0#[data-design-id=el-mtskupgn-z00g6] (span)"

    const Harness = () => {
      const [val, setVal] = useState(currentVal)
      return (
        <AgentMarkdownInput
          ref={(node) => {
            refHolder.current = node
          }}
          value={val}
          onChange={(newVal) => {
            currentVal = newVal
            setVal(newVal)
          }}
          onSend={() => {}}
        />
      )
    }

    render(<Harness />)
    await act(async () => {})

    refHolder.current?.setSelectionRange(currentVal.length, currentVal.length)
    const editor = document.querySelector(".cm-content") as HTMLElement
    expect(editor).not.toBeNull()

    // 触发 Backspace
    fireEvent.keyDown(editor, { key: "Backspace" })
    expect(currentVal).toBe("")
  })
})
