import { EditorState, type Extension, Transaction } from "@codemirror/state"
import { Decoration, EditorView, WidgetType } from "@codemirror/view"

/**
 * 模板块预览起止行只读保护：文档首行是 --start 行、末行是 --end 行时，
 * 仅允许修改两者之间的正文区域，阻止编辑起止行；外部来源变更（表单驱动同步）放行。
 */
export const agentBlockPreviewProtection: Extension = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr
  if (tr.annotation(Transaction.remote)) return tr

  const doc = tr.startState.doc
  if (doc.lines < 2) return tr
  const firstLine = doc.line(1)
  const lastLine = doc.line(doc.lines)
  if (!/--start/.test(firstLine.text) || !/--end/.test(lastLine.text)) return tr

  let blocked = false
  tr.changes.iterChanges((from, to) => {
    if (blocked) return
    // 仅允许落在首行之后、末行之前的正文区域变更。
    if (!(from > firstLine.to && to < lastLine.from)) blocked = true
  })
  return blocked ? [] : tr
})

// 结束行末尾的 id 预览占位（真实文本不含 id，插入文档时统一注入）。
class AgentBlockIdPlaceholderWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span")
    span.className = "cm-md-template-id"
    span.textContent = ` {id:${"x".repeat(32)}}`
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}

// 结束行末尾渲染 id 占位装饰。
export const agentBlockIdPlaceholder: Extension = EditorView.decorations.compute(
  ["doc"],
  (state) => {
    const doc = state.doc
    if (doc.lines < 2) return Decoration.none
    const lastLine = doc.line(doc.lines)
    if (!/--end/.test(lastLine.text)) return Decoration.none

    return Decoration.set([
      Decoration.widget({ widget: new AgentBlockIdPlaceholderWidget(), side: 1 }).range(
        lastLine.to,
      ),
    ])
  },
)

// id 占位样式与文档编辑器（features/markdown/extensions/editorTheme.ts）保持一致；像素主题下由全局 CSS 覆盖。
const agentBlockPreviewTheme = EditorView.theme({
  ".cm-md-template-id, .cm-md-template-id *": {
    color: "#f0abfc !important",
    backgroundColor: "rgba(240, 171, 252, 0.14) !important",
    padding: "1px 6px !important",
    borderRadius: "3px !important",
    fontWeight: "600 !important",
  },
})

// 设置页模板块预览扩展：起止行只读 + 结束行 id 占位。
export const agentBlockPreviewExtensions: Extension = [
  agentBlockPreviewProtection,
  agentBlockIdPlaceholder,
  agentBlockPreviewTheme,
]
