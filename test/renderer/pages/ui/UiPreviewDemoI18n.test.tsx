// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useTranslation } from "@/i18n"
import { AgentCompactionDemo } from "@/pages/ui/components/AgentCompactionDemo"
import { AgentQuestionDemo } from "@/pages/ui/components/AgentQuestionDemo"
import { LxIconButtonDemo } from "@/pages/ui/components/LxIconButtonDemo"

const CJK_PATTERN = /[\u4e00-\u9fa5]/

describe("UI Preview Demo 国际化", () => {
  afterEach(() => {
    cleanup()
  })

  it("LxIconButtonDemo 的交互文案使用英文词条", () => {
    const { container } = render(<LxIconButtonDemo />)

    expect(screen.getByLabelText("Small size")).not.toBeNull()
    expect(screen.getByLabelText("Add (circle)")).not.toBeNull()
    expect(screen.getByLabelText("Add (disabled)")).not.toBeNull()
    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })

  it("AgentQuestionDemo 渲染英文示例数据，阶段标题使用 text-xs 预设", () => {
    const { container } = render(<AgentQuestionDemo />)

    const stageLabel = screen.getByText("1. Pending Answer Stage (Pending)")
    expect(stageLabel.className).toContain("text-xs")
    expect(screen.getByText("Turbo Mode")).not.toBeNull()
    expect(screen.getByText("Standard Mode")).not.toBeNull()
    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })

  it("AgentCompactionDemo 的示例摘要来自词条", () => {
    const { container } = render(<AgentCompactionDemo />)

    expect(container.textContent).toContain("Context Compaction Summary")
    expect(container.textContent).toContain("Key decisions kept")
    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })

  it("Demo toast 词条支持参数插值", () => {
    let message = ""
    const Probe = (): null => {
      const { t } = useTranslation()
      message = t("uiPreview.demos.toast.sendMessage", { text: "hello", mode: "steer" })
      return null
    }

    render(<Probe />)

    expect(message).toBe("Message sent: hello [mode: steer]")
  })
})
