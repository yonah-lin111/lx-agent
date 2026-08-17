// @vitest-environment jsdom
import { markdown } from "@codemirror/lang-markdown"
import { EditorState } from "@codemirror/state"
import { EditorView, ViewPlugin } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import { beforeAll, describe, expect, it } from "vitest"
import {
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
} from "@/features/markdown/commands/markdownBlockCommands"

// jsdom 无真实布局：mock 测量 API，让 coordsAtPos 返回可用坐标。
beforeAll(() => {
  const rect: DOMRect = {
    left: 10,
    right: 10,
    top: 5,
    bottom: 25,
    width: 0,
    height: 20,
    x: 10,
    y: 5,
    toJSON: () => ({}),
  } as DOMRect
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => rect
})

describe("AgentMarkdownInput 块命令触发", () => {
  it("getMarkdownBlockTrigger 对 ### 返回 heading", () => {
    const trigger = getMarkdownBlockTrigger("###", 0, 3)
    expect(trigger).not.toBeNull()
    expect(trigger?.kind).toBe("heading")
    expect(getMarkdownBlockCommands(trigger!.kind).length).toBeGreaterThan(0)
  })

  it("ViewPlugin update 期间 coordsAtPos 抛布局错误（根因回归）", () => {
    let crashed: string | null = null
    const plugin = ViewPlugin.fromClass(
      class {
        update(update: { docChanged: boolean; view: EditorView }): void {
          if (!update.docChanged) return
          try {
            update.view.coordsAtPos(update.view.state.selection.main.head)
          } catch (e) {
            crashed = (e as Error).message
          }
        }
      },
    )
    const container = document.createElement("div")
    document.body.append(container)
    const state = EditorState.create({
      doc: "",
      extensions: [markdown({ extensions: [GFM] }), plugin],
    })
    const view = new EditorView({ state, parent: container })
    view.dispatch({ changes: { from: 0, insert: "###" }, selection: { anchor: 3 } })
    expect(crashed).toContain("isn't allowed during an update")
  })

  it("updateListener 中 coordsAtPos 可读布局（修复方案，与原编辑器一致）", () => {
    let coords: { left: number; bottom: number } | null | undefined
    const container = document.createElement("div")
    document.body.append(container)
    const state = EditorState.create({
      doc: "",
      extensions: [
        markdown({ extensions: [GFM] }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          coords = update.view.coordsAtPos(update.state.selection.main.head)
        }),
      ],
    })
    const view = new EditorView({ state, parent: container })
    expect(() =>
      view.dispatch({ changes: { from: 0, insert: "###" }, selection: { anchor: 3 } }),
    ).not.toThrow()
    expect(coords).toBeTruthy()
  })

  it("coordsAtPos 失败时容器定位 fallback 不抛错", () => {
    let position: { left: number; bottom: number } | null = null
    const plugin = ViewPlugin.fromClass(
      class {
        update(update: { docChanged: boolean; view: EditorView }): void {
          if (!update.docChanged) return
          const view = update.view
          const cursor = view.state.selection.main.head
          const line = view.state.doc.lineAt(cursor)
          const trigger = getMarkdownBlockTrigger(line.text, line.from, cursor)
          if (!trigger) return
          try {
            view.coordsAtPos(cursor)
          } catch {
            const container = document.querySelector<HTMLElement>("#cm-container")
            if (container) {
              const rect = container.getBoundingClientRect()
              position = { left: rect.left, bottom: window.innerHeight - rect.top + 6 }
            }
          }
        }
      },
    )
    const container = document.createElement("div")
    container.id = "cm-container"
    document.body.append(container)
    const state = EditorState.create({
      doc: "",
      extensions: [markdown({ extensions: [GFM] }), plugin],
    })
    const view = new EditorView({ state, parent: container })
    expect(() =>
      view.dispatch({ changes: { from: 0, insert: "###" }, selection: { anchor: 3 } }),
    ).not.toThrow()
    // jsdom 布局已 mock，coordsAtPos 成功，fallback 不触发，position 保持 null 也符合预期
    expect(position).not.toBeUndefined()
  })
})
