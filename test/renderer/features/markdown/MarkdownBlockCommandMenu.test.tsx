// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
  getMarkdownBlockCommands,
  type MarkdownBlockTriggerKind,
} from "@/features/markdown/commands/markdownBlockCommands"
import { MarkdownBlockCommandMenu } from "@/features/markdown/components/MarkdownBlockCommandMenu"

describe("MarkdownBlockCommandMenu 与块命令国际化", () => {
  afterEach(() => {
    cleanup()
  })
  it("visible 为 false 时不渲染任何内容", () => {
    const { container } = render(
      <MarkdownBlockCommandMenu
        commands={getMarkdownBlockCommands("heading", "zh")}
        visible={false}
        position={{ top: 0, left: 0 }}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("中文环境下渲染中文块命令", () => {
    const zhCommands = getMarkdownBlockCommands("heading", "zh")
    render(
      <MarkdownBlockCommandMenu
        commands={zhCommands}
        visible={true}
        activeIndex={1}
        position={{ top: 100, left: 50 }}
      />,
    )

    const menu = screen.getByRole("listbox")
    expect(menu).not.toBeNull()

    // 标题命令文案应为中文
    expect(screen.getByText("1 级标题")).not.toBeNull()
    expect(screen.getByText("2 级标题")).not.toBeNull()
    expect(screen.getByText("6 级标题")).not.toBeNull()

    // 检查 activeIndex 对应的选项 aria-selected
    const options = screen.getAllByRole("option")
    expect(options[1].getAttribute("aria-selected")).toBe("true")
    expect(options[0].getAttribute("aria-selected")).toBe("false")
  })

  it("英文环境下渲染英文块命令", () => {
    const enCommands = getMarkdownBlockCommands("heading", "en")
    render(
      <MarkdownBlockCommandMenu
        commands={enCommands}
        visible={true}
        activeIndex={0}
        position={{ top: 100, left: 50 }}
      />,
    )

    expect(screen.getByText("Heading 1")).not.toBeNull()
    expect(screen.getByText("Heading 2")).not.toBeNull()
    expect(screen.getByText("Heading 6")).not.toBeNull()
  })

  it("支持自定义 ariaLabel 覆盖默认无障碍文案", () => {
    const commands = getMarkdownBlockCommands("unorderedList", "en")
    render(
      <MarkdownBlockCommandMenu
        ariaLabel="Custom Block Command Menu"
        commands={commands}
        visible={true}
        position={{ top: 0, left: 0 }}
      />,
    )

    const menu = screen.getByRole("listbox")
    expect(menu.getAttribute("aria-label")).toBe("Custom Block Command Menu")
    expect(screen.getByText("Bullet List")).not.toBeNull()
    expect(screen.getByText("Task List")).not.toBeNull()
  })

  it("全部触发类型在中英文下的命令完整性与文本对应关系", () => {
    const kinds: MarkdownBlockTriggerKind[] = [
      "heading",
      "unorderedList",
      "orderedList",
      "quote",
      "codeBlock",
      "table",
    ]

    for (const kind of kinds) {
      const zhCmds = getMarkdownBlockCommands(kind, "zh")
      const enCmds = getMarkdownBlockCommands(kind, "en")

      expect(zhCmds.length).toBe(enCmds.length)
      for (let i = 0; i < zhCmds.length; i++) {
        expect(zhCmds[i].id).toBe(enCmds[i].id)
        expect(zhCmds[i].preview).toBe(enCmds[i].preview)
        expect(zhCmds[i].icon).toBe(enCmds[i].icon)
        // 中文和英文 label 必须不同且非空
        expect(zhCmds[i].label).toBeTruthy()
        expect(enCmds[i].label).toBeTruthy()
        expect(zhCmds[i].label).not.toBe(enCmds[i].label)
      }
    }
  })

  it("各种列表和代码块命令文案中英文精准匹配", () => {
    // 无序列表
    expect(getMarkdownBlockCommands("unorderedList", "zh")[0].label).toBe("无序列表")
    expect(getMarkdownBlockCommands("unorderedList", "en")[0].label).toBe("Bullet List")

    // 任务列表
    expect(getMarkdownBlockCommands("unorderedList", "zh")[1].label).toBe("任务列表")
    expect(getMarkdownBlockCommands("unorderedList", "en")[1].label).toBe("Task List")

    // 有序列表
    expect(getMarkdownBlockCommands("orderedList", "zh")[0].label).toBe("有序列表")
    expect(getMarkdownBlockCommands("orderedList", "en")[0].label).toBe("Numbered List")

    // 引用
    expect(getMarkdownBlockCommands("quote", "zh")[0].label).toBe("引用")
    expect(getMarkdownBlockCommands("quote", "en")[0].label).toBe("Quote")

    // 代码块
    expect(getMarkdownBlockCommands("codeBlock", "zh")[0].label).toBe("代码块")
    expect(getMarkdownBlockCommands("codeBlock", "en")[0].label).toBe("Code Block")

    // 表格
    expect(getMarkdownBlockCommands("table", "zh")[0].label).toBe("表格")
    expect(getMarkdownBlockCommands("table", "en")[0].label).toBe("Table")
  })
})
