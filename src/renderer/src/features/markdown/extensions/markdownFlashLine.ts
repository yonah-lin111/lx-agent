import { StateEffect, StateField } from "@codemirror/state"
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view"

/**
 * CodeMirror 行跳转快速闪烁高亮状态效果。
 */
export const flashLineEffect = StateEffect.define<{ line: number }>()

/**
 * CodeMirror 行跳转快速闪烁高亮字段扩展。
 */
export const lineFlashField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(value, tr) {
    value = value.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(flashLineEffect)) {
        const lineNum = Math.max(1, Math.min(effect.value.line, tr.state.doc.lines))
        const line = tr.state.doc.line(lineNum)
        const deco = Decoration.line({
          class: "cm-md-line-flash",
        })
        value = Decoration.none.update({
          add: [deco.range(line.from)],
        })
      }
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f),
})
