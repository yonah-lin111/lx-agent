// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FrontDesignIteratePanel } from "@/pages/front-design/components/FrontDesignIteratePanel"

describe("FrontDesignIteratePanel", () => {
  afterEach(cleanup)

  it("渲染 5 个动作并在点击时回传动作 id", () => {
    const onAction = vi.fn()
    render(<FrontDesignIteratePanel disabled={false} onAction={onAction} />)

    const labels = [
      /补齐状态|Complete states/,
      /适配移动端|Adapt for mobile/,
      /补充暗色模式|Add dark mode/,
      /增强微交互|Add micro-interactions/,
      /生成变体|Generate variant/,
    ]
    for (const label of labels) {
      expect(screen.getByText(label)).not.toBeNull()
    }

    fireEvent.click(screen.getByText(/生成变体|Generate variant/))
    expect(onAction).toHaveBeenCalledWith("variant")
  })

  it("禁用态下动作不可点击", () => {
    const onAction = vi.fn()
    render(<FrontDesignIteratePanel disabled onAction={onAction} />)

    const button = screen
      .getByText(/补齐状态|Complete states/)
      .closest("button") as HTMLButtonElement
    expect(button.disabled).toBe(true)

    fireEvent.click(button)
    expect(onAction).not.toHaveBeenCalled()
  })
})
