// @vitest-environment jsdom

import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"
import { markdownMarkerHighlight } from "@/components/ui/LxMarkdown/extensions/markdownEditorExtensions"

describe("markdown table editor widget", () => {
  let view: EditorView | null = null

  afterEach(() => {
    view?.destroy()
    view = null
  })

  it("在光标离开表格后渲染表格行，进入表格后恢复源码", () => {
    const content = "| Header | Value |\n| --- | --- |\n| **Content** | `Text` |\n\noutside"
    const parent = document.createElement("div")
    document.body.appendChild(parent)
    view = new EditorView({
      state: EditorState.create({
        doc: content,
        selection: { anchor: content.length },
        extensions: [markdownMarkerHighlight()],
      }),
      parent,
    })

    expect(parent.querySelectorAll(".cm-md-table-row-widget")).toHaveLength(2)
    expect(parent.querySelector(".cm-md-table-row-widget")?.textContent).toContain("Header")
    expect(parent.querySelector(".cm-md-table-row-widget--body strong")?.textContent).toBe(
      "Content",
    )
    expect(parent.querySelector(".cm-md-table-row-widget--body code")?.textContent).toBe("Text")
    expect(parent.querySelector(".cm-md-table-separator-line")).toBeTruthy()

    view.dispatch({ selection: { anchor: 0 } })

    expect(parent.querySelectorAll(".cm-md-table-row-widget")).toHaveLength(0)
    expect(view.dom.textContent).toContain("| Header | Value |")

    parent.remove()
  })
})
