// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScheduleRolloverBanner } from "@/features/schedule/components/ScheduleRolloverBanner"

afterEach(() => {
  cleanup()
})

describe("ScheduleRolloverBanner", () => {
  it("显示待顺延数量并响应顺延与忽略点击", () => {
    const handleRollover = vi.fn()
    const handleDismiss = vi.fn()

    render(
      <ScheduleRolloverBanner
        count={3}
        isRollingOver={false}
        onRollover={handleRollover}
        onDismiss={handleDismiss}
      />,
    )

    expect(screen.getByText(/3/)).toBeDefined()

    // 点击顺延
    const rolloverBtn = screen.getByRole("button", { name: /move to today|顺延/i })
    fireEvent.click(rolloverBtn)
    expect(handleRollover).toHaveBeenCalledOnce()

    // 点击忽略
    const dismissBtn = screen.getByRole("button", { name: /dismiss|忽略/i })
    fireEvent.click(dismissBtn)
    expect(handleDismiss).toHaveBeenCalledOnce()
  })
})
