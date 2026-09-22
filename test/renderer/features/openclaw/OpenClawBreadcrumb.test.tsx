// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenClawBreadcrumb } from "@/features/openclaw/components/OpenClawBreadcrumb"
import { useOpenClawOfficeStore } from "@/features/openclaw/openclawOfficeStore"

const instances = {
  local: { name: "本机 Gateway", enabled: true, agents: [] },
}

vi.mock("@/features/openclaw/hooks/useOpenClawConfig", () => ({
  useOpenClawConfig: () => ({ instances, enabledInstances: [] }),
}))

describe("OpenClawBreadcrumb", () => {
  beforeEach(() => {
    useOpenClawOfficeStore.setState({ selectedInstanceId: "local" })
  })

  afterEach(() => {
    cleanup()
  })

  it("选中实例存在时渲染办公区名", () => {
    render(<OpenClawBreadcrumb />)

    expect(screen.getByText("本机 Gateway")).not.toBeNull()
  })

  it("未选中实例时不渲染", () => {
    useOpenClawOfficeStore.setState({ selectedInstanceId: null })

    const { container } = render(<OpenClawBreadcrumb />)

    expect(container.textContent).toBe("")
  })

  it("实例已不存在时不渲染裸 id", () => {
    useOpenClawOfficeStore.setState({ selectedInstanceId: "missing" })

    const { container } = render(<OpenClawBreadcrumb />)

    expect(container.textContent).toBe("")
  })
})
