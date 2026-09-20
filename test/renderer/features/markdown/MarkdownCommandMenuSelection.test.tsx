// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  MarkdownSendPromptFlagOption,
  MarkdownSendPromptOption,
  MarkdownSlashCommand,
} from "@/features/markdown/commands/markdownSlashCommands"
import { FileMentionCommandMenu } from "@/features/markdown/components/FileMentionCommandMenu"
import {
  MarkdownPasteCommandMenu,
  type MarkdownPasteReferenceOption,
} from "@/features/markdown/components/MarkdownPasteCommandMenu"
import { MarkdownSendPromptCommandMenu } from "@/features/markdown/components/MarkdownSendPromptCommandMenu"
import { MarkdownSendPromptFlagCommandMenu } from "@/features/markdown/components/MarkdownSendPromptFlagCommandMenu"
import { MarkdownSlashCommandMenu } from "@/features/markdown/components/MarkdownSlashCommandMenu"
import type { MarkdownFileMentionEntry } from "@/features/markdown/types"

const slashCommands: MarkdownSlashCommand[] = [
  {
    id: "addTemplate",
    label: "/addTemplate",
    description: "Insert add template",
    content: "",
    cursorOffset: 0,
    scope: "normal",
    kind: "direct",
  },
  {
    id: "varTemplate",
    label: "/varTemplate",
    description: "Insert var template",
    content: "",
    cursorOffset: 0,
    scope: "normal",
    kind: "direct",
  },
]

const pasteOptions: MarkdownPasteReferenceOption[] = [
  { id: "reference", label: "Reference" },
  { id: "path", label: "Path" },
]

const sendPromptOptions: MarkdownSendPromptOption[] = [
  {
    id: "lx",
    targetType: "agent",
    name: "lx",
    label: "lx",
    description: "Agent",
    tag: "Agent",
  },
  {
    id: "claude",
    targetType: "claude",
    name: "claude",
    label: "claude",
    description: "Claude Code",
    tag: "CLI",
  },
]

const sendPromptFlagOptions: MarkdownSendPromptFlagOption[] = [
  { id: "-enter", name: "-enter", label: "-enter", description: "Enter", tag: "Flag" },
]

const mentionFiles: MarkdownFileMentionEntry[] = [
  { path: "/repo/src/a.ts", isDirectory: false, mentionPath: "src/a.ts", source: "current" },
  { path: "/repo/src/b.ts", isDirectory: false, mentionPath: "src/b.ts", source: "current" },
]

const position = { top: 10, left: 10 }

describe("Markdown 命令面板鼠标点选交互", () => {
  afterEach(() => {
    cleanup()
  })

  it("斜杠命令面板：点选非激活项触发 onSelect，悬停不改变键盘激活项", () => {
    const onSelect = vi.fn()
    render(
      <MarkdownSlashCommandMenu
        activeIndex={0}
        commands={slashCommands}
        position={position}
        visible={true}
        onSelect={onSelect}
      />,
    )

    const options = screen.getAllByRole("option")
    fireEvent.mouseEnter(options[1])
    expect(options[0].getAttribute("aria-selected")).toBe("true")
    expect(options[1].getAttribute("aria-selected")).toBe("false")

    fireEvent.mouseDown(options[1])
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(slashCommands[1])
  })

  it("粘贴引用面板：点选选项触发 onSelect", () => {
    const onSelect = vi.fn()
    render(
      <MarkdownPasteCommandMenu
        activeIndex={0}
        options={pasteOptions}
        position={position}
        visible={true}
        onSelect={onSelect}
      />,
    )

    fireEvent.mouseDown(screen.getByRole("option", { name: /Path/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(pasteOptions[1])
  })

  it("sendPrompt 目标面板：点选目标触发 onSelect", () => {
    const onSelect = vi.fn()
    render(
      <MarkdownSendPromptCommandMenu
        activeIndex={0}
        options={sendPromptOptions}
        position={position}
        visible={true}
        onSelect={onSelect}
      />,
    )

    fireEvent.mouseDown(screen.getByRole("option", { name: /claude/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(sendPromptOptions[1])
  })

  it("sendPrompt 标志位面板：点选标志触发 onSelect", () => {
    const onSelect = vi.fn()
    render(
      <MarkdownSendPromptFlagCommandMenu
        activeIndex={0}
        options={sendPromptFlagOptions}
        position={position}
        visible={true}
        onSelect={onSelect}
      />,
    )

    fireEvent.mouseDown(screen.getByRole("option"))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(sendPromptFlagOptions[0])
  })

  it("文件提及面板：点选候选文件触发 onSelect", () => {
    const onSelect = vi.fn()
    render(
      <FileMentionCommandMenu
        activeIndex={0}
        files={mentionFiles}
        position={position}
        visible={true}
        onSelect={onSelect}
      />,
    )

    fireEvent.mouseDown(screen.getByRole("option", { name: /b.ts/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(mentionFiles[1])
  })

  it("字母快捷输入面板：变量候选排在文件之后，点选触发 onSelectVariable 并展示 var tag", () => {
    const onSelectVariable = vi.fn()
    render(
      <FileMentionCommandMenu
        activeIndex={0}
        files={[
          { ...mentionFiles[0], templateKind: "referFile", templateSource: "varContentBlock" },
        ]}
        position={position}
        variables={[
          { name: "repo", value: "lx-agent" },
          { name: "temp.status", value: "active" },
        ]}
        visible={true}
        onSelect={() => undefined}
        onSelectVariable={onSelectVariable}
      />,
    )

    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(3)
    expect(options[0].getAttribute("data-index")).toBe("0")
    expect(options[1].getAttribute("data-index")).toBe("1")
    expect(options[0].textContent).toContain("@content")
    expect(options[1].textContent).toContain("repo")
    expect(options[1].textContent?.match(/var/g)).toHaveLength(1)
    expect(options[2].textContent).toContain("temp.status")
    expect(options[2].textContent).toContain("temp")
    expect(options[2].textContent?.match(/var/g)).toHaveLength(1)

    fireEvent.mouseDown(options[1])
    expect(onSelectVariable).toHaveBeenCalledTimes(1)
    expect(onSelectVariable).toHaveBeenCalledWith({ name: "repo", value: "lx-agent" })
  })
})
