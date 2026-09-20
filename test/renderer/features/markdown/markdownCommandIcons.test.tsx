import { isValidElement } from "react"
import { describe, expect, it } from "vitest"
import {
  getBuiltinMarkdownSlashCommands,
  type MarkdownSlashCommand,
} from "@/features/markdown/commands/markdownSlashCommands"
import {
  DEFAULT_SLASH_COMMAND_ICON,
  getSlashCommandIcon,
} from "@/features/markdown/components/markdownCommandIcons"

// 判断命令是否落到了兜底图标。
const usesFallbackIcon = (command: MarkdownSlashCommand): boolean => {
  const element = getSlashCommandIcon(command)
  return isValidElement(element) && element.type === DEFAULT_SLASH_COMMAND_ICON
}

describe("Markdown 命令图标映射", () => {
  it("所有内置斜杠命令都有显式语义图标，不落兜底", () => {
    const commands = getBuiltinMarkdownSlashCommands("zh")
    expect(commands.length).toBeGreaterThan(0)

    for (const command of commands) {
      expect(usesFallbackIcon(command), `command ${command.id} 落入兜底图标`).toBe(false)
    }
  })

  it("自定义模板命令使用文件图标，未知内置命令回退兜底", () => {
    const customCommand: MarkdownSlashCommand = {
      id: "myCommand",
      label: "/myCommand",
      description: "",
      content: "",
      cursorOffset: 0,
      scope: "normal",
      kind: "customTemplate",
      source: "project",
    }
    expect(usesFallbackIcon(customCommand)).toBe(false)

    const unknownCommand: MarkdownSlashCommand = {
      id: "unknownCommand",
      label: "/unknownCommand",
      description: "",
      content: "",
      cursorOffset: 0,
      scope: "normal",
      kind: "direct",
      source: "builtin",
    }
    expect(usesFallbackIcon(unknownCommand)).toBe(true)
  })
})
