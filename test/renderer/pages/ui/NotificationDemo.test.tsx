// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NotificationDemo } from "@/pages/ui/components/NotificationDemo"

const CJK_PATTERN = /[\u4e00-\u9fa5]/
const showDemo = vi.fn()

describe("NotificationDemo", () => {
  beforeEach(() => {
    showDemo.mockClear()
    window.api = {
      notification: { showDemo, onClick: () => () => {} },
    } as unknown as typeof window.api
  })

  afterEach(() => {
    cleanup()
  })

  it("点击按钮通过通知 API 触发真实演示通知", () => {
    const { container } = render(<NotificationDemo />)

    fireEvent.click(screen.getByRole("button", { name: "Send Test Notification" }))

    expect(showDemo).toHaveBeenCalledOnce()
    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })
})
