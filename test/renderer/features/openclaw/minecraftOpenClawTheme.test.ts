import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relativePath}`, import.meta.url)), "utf8")

const minecraftAgentCss = readSource("src/renderer/src/styles/themes/minecraft/agent.css")

describe("我的世界主题 OpenClaw 外观", () => {
  it("左侧栏条目使用实体槽位底色并保留选中/悬停态", () => {
    expect(minecraftAgentCss).toMatch(
      /\[data-theme="minecraft"\] \.openclaw-office-item,\n\[data-theme="minecraft"\] \.openclaw-agent-item \{\n\s*background-color: #2c2c3c !important/,
    )
    expect(minecraftAgentCss).toContain(
      '[data-theme="minecraft"] .openclaw-office-item[data-active="true"]',
    )
    expect(minecraftAgentCss).toContain(
      '[data-theme="minecraft"] .openclaw-agent-item[aria-pressed="true"]',
    )
    expect(minecraftAgentCss).toContain("background-color: #2e4773 !important")
  })

  it("AI 消息气泡不再命中输入框马赛克规则，输入框本身仍保留主题化", () => {
    // .bg-[#2a2a2a] 曾让 OpenClaw AI 气泡继承输入框的马赛克外框，现仅保留输入框容器选择器。
    expect(minecraftAgentCss).not.toContain(".bg-\\[\\#2a2a2a\\]")
    expect(minecraftAgentCss).toContain('[data-theme="minecraft"] .agent-input-container {')
    expect(minecraftAgentCss).toContain(
      '[data-theme="minecraft"] .agent-input-container:focus-within {',
    )
  })
})
