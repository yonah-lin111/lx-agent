// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AgentContextUsagePill } from "@/features/agent/components/AgentContextUsagePill"

describe("AgentContextUsagePill", () => {
  it("渲染正常绿色状态（<75%）", () => {
    const { container } = render(
      <AgentContextUsagePill contextUsage={{ tokens: 50_000, contextWindow: 100_000 }} />,
    )
    expect(screen.getByText("50%")).not.toBeNull()
    const dot = container.querySelector(".bg-emerald-400")
    expect(dot).not.toBeNull()
  })

  it("渲染预警琥珀色状态（75% - 89%）", () => {
    const { container } = render(
      <AgentContextUsagePill contextUsage={{ tokens: 80_000, contextWindow: 100_000 }} />,
    )
    expect(screen.getByText("80%")).not.toBeNull()
    const dot = container.querySelector(".bg-amber-400")
    expect(dot).not.toBeNull()
  })

  it("渲染高危红色脉冲状态（>=90%）", () => {
    const { container } = render(
      <AgentContextUsagePill contextUsage={{ tokens: 92_000, contextWindow: 100_000 }} />,
    )
    expect(screen.getByText("92%")).not.toBeNull()
    const dot = container.querySelector(".bg-red-400.animate-pulse")
    expect(dot).not.toBeNull()
  })
})
