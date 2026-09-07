import { StateEffect } from "@codemirror/state"
import { WidgetType } from "@codemirror/view"
import { createElement, Fragment, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { MarkdownTemplateStatus } from "@/features/markdown/commands/markdownBlockCommands"
import {
  MarkdownActionCleanButton,
  MarkdownActionCopyButton,
  MarkdownActionDeleteButton,
  MarkdownActionFoldButton,
  TemplateStatusButton,
} from "@/features/markdown/extensions/markdownActionWidgets"

// 代码块或模板块折叠状态变更事件。
export const markdownBlockFoldToggleEffect = StateEffect.define<void>()

// 模板块状态切换配置。
export interface TemplateStatusAction {
  line: number
  status: MarkdownTemplateStatus
  onToggle: (line: number) => void
}

// Markdown 标记装饰项联合类型。
export type MarkerDecoItem =
  | { type: "line"; from: number; className: string }
  | { type: "mark"; from: number; to: number; className: string; atomic?: boolean }
  | { type: "widget"; from: number; to: number; widget: CodeBlockActionWidget }

// 渲染代码块与模板块右上角操作按钮（复制、折叠、状态切换等）。
export class CodeBlockActionWidget extends WidgetType {
  private reactRoot: Root | null = null

  constructor(
    readonly codeText: string,
    readonly isFolded: boolean,
    readonly onToggleFold: () => void,
    readonly showFoldBtn = true,
    readonly actionClassName = "cm-code-block-action-wrap",
    readonly copyTitle?: string,
    readonly foldTitle?: string,
    readonly unfoldTitle?: string,
    readonly templateStatus: TemplateStatusAction | null = null,
    readonly templateStartLine: number | null = null,
    readonly onDeleteTemplate: (() => void) | null = null,
    readonly onCleanTemplate: (() => void) | null = null,
    readonly isSupple = false,
    readonly isLog = false,
    readonly blockEndLine: number | null = null,
    readonly blockId: string | null = null,
  ) {
    super()
  }

  eq(other: CodeBlockActionWidget) {
    return (
      this.codeText === other.codeText &&
      this.isFolded === other.isFolded &&
      this.showFoldBtn === other.showFoldBtn &&
      this.actionClassName === other.actionClassName &&
      this.templateStatus?.line === other.templateStatus?.line &&
      this.templateStatus?.status === other.templateStatus?.status &&
      this.templateStartLine === other.templateStartLine &&
      this.blockEndLine === other.blockEndLine &&
      this.blockId === other.blockId &&
      this.isSupple === other.isSupple &&
      this.isLog === other.isLog
    )
  }

  toDOM() {
    const wrap = document.createElement("span")
    wrap.className = this.actionClassName
    wrap.style.position = "absolute"
    wrap.style.top = "50%"
    wrap.style.right = "12px"
    wrap.style.display = "inline-flex"
    wrap.style.alignItems = "center"
    wrap.style.gap = "6px"
    wrap.style.background = "transparent"
    wrap.style.border = "none"
    wrap.style.borderRadius = "4px"
    wrap.style.padding = "2px 4px"
    wrap.style.zIndex = "10"
    wrap.style.transform = "translateY(-50%)"

    const isTemplate = Boolean(this.templateStatus)
    const actionNodes: ReactNode[] = []
    if (this.templateStatus) {
      actionNodes.push(
        createElement(TemplateStatusButton, {
          status: this.templateStatus.status,
          onToggle: () => this.templateStatus?.onToggle(this.templateStatus.line),
        }),
      )
    }
    if ((this.templateStatus || this.isSupple || this.isLog) && this.onCleanTemplate) {
      actionNodes.push(
        createElement(MarkdownActionCleanButton, {
          onClean: this.onCleanTemplate,
          isSupple: this.isSupple,
          isLog: this.isLog,
        }),
      )
    }
    if ((this.templateStatus || this.isSupple || this.isLog) && this.onDeleteTemplate) {
      actionNodes.push(
        createElement(MarkdownActionDeleteButton, {
          onDelete: this.onDeleteTemplate,
          isSupple: this.isSupple,
          isLog: this.isLog,
        }),
      )
    }
    if (!this.isLog) {
      actionNodes.push(
        createElement(MarkdownActionCopyButton, {
          text: this.codeText,
          label: this.copyTitle,
          isTemplate,
          isSupple: this.isSupple,
          isLog: this.isLog,
        }),
      )
    }
    if (this.showFoldBtn) {
      actionNodes.push(
        createElement(MarkdownActionFoldButton, {
          isFolded: this.isFolded,
          label: this.foldTitle,
          unfoldLabel: this.unfoldTitle,
          isTemplate,
          isSupple: this.isSupple,
          isLog: this.isLog,
          onToggle: this.onToggleFold,
        }),
      )
    }

    this.reactRoot = createRoot(wrap)
    this.reactRoot.render(createElement(Fragment, null, ...actionNodes))
    return wrap
  }

  destroy(_dom: HTMLElement): void {
    const root = this.reactRoot
    this.reactRoot = null
    // 推迟到微任务，避免在 React 渲染/提交期间同步 unmount 子 root 触发警告。
    if (root) queueMicrotask(() => root.unmount())
  }
}
