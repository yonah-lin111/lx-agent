// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  type OpenClawPickerItem,
  OpenClawPickerPanel,
} from "@/features/openclaw/components/OpenClawPickerPanel"

const items: OpenClawPickerItem[] = [
  { id: "agent-a", label: "Agent A", hint: "idle", selected: true },
  { id: "agent-b", label: "Agent B", hint: "busy" },
]

const position = { top: 10, left: 10 }

describe("OpenClawPickerPanel 鼠标点选交互", () => {
  afterEach(() => {
    cleanup()
  })

  it("点选条目触发 onSelect，悬停不改变键盘激活项", () => {
    const onSelect = vi.fn()
    render(
      <OpenClawPickerPanel
        isOpen={true}
        position={position}
        title="Select agent"
        emptyText="No agents"
        items={items}
        activeIndex={0}
        onSelect={onSelect}
      />,
    )

    const options = screen.getAllByRole("option")
    fireEvent.mouseEnter(options[1])
    expect(options[0].getAttribute("aria-selected")).toBe("true")
    expect(options[1].getAttribute("aria-selected")).toBe("false")

    fireEvent.mouseDown(options[1])
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(items[1])
  })

  it("无条目时渲染空态文本", () => {
    render(
      <OpenClawPickerPanel
        isOpen={true}
        position={position}
        title="Select agent"
        emptyText="No agents"
        items={[]}
        activeIndex={0}
      />,
    )

    expect(screen.getByText("No agents")).not.toBeNull()
  })
})
