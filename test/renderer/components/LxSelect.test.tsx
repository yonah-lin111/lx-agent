// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"

describe("LxSelect", () => {
  afterEach(cleanup)

  it("正确渲染选项并区分未导入项目样式与 data-unimported 标记", () => {
    const handleChange = vi.fn()
    const options: LxSelectOption<string>[] = [
      { value: "all", label: "全部项目", isImported: true },
      { value: "p1", label: "已导入项目", isImported: true },
      { value: "p2", label: "未导入项目", isImported: false },
    ]

    const { rerender } = render(<LxSelect value="p2" onChange={handleChange} options={options} />)

    // 触发按钮选中未导入项目时应标记 data-unimported
    const trigger = screen.getByRole("button", { expanded: false })
    expect(trigger.getAttribute("data-unimported")).toBe("true")
    expect(trigger.className).toContain("text-white/40")

    // 点击打开下拉
    fireEvent.click(trigger)

    const optionElements = screen.getAllByRole("option")
    expect(optionElements).toHaveLength(3)

    // 检查第 1 项（已导入）
    expect(optionElements[0].getAttribute("data-unimported")).toBeNull()
    expect(optionElements[0].className).not.toContain("text-white/40")

    // 检查第 3 项（未导入）
    expect(optionElements[2].getAttribute("data-unimported")).toBe("true")
    expect(optionElements[2].className).toContain("text-white/40")

    // 点击选择第一项
    fireEvent.mouseDown(optionElements[0])
    expect(handleChange).toHaveBeenCalledWith("all")

    // 重新传入 value="p1"，触发按钮应不带有 data-unimported 属性
    rerender(<LxSelect value="p1" onChange={handleChange} options={options} />)
    const updatedTrigger = screen.getByRole("button")
    expect(updatedTrigger.getAttribute("data-unimported")).toBeNull()
  })

  it("滚动关闭：仅触发按钮所在滚动链路（含 document）的滚动会收起下拉", () => {
    const handleChange = vi.fn()
    const options: LxSelectOption<string>[] = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ]
    render(<LxSelect value="a" onChange={handleChange} options={options} />)

    const trigger = screen.getByRole("button", { expanded: false })
    fireEvent.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")

    // 无关容器滚动（如消息列表吸底滚动）：不关闭
    const unrelatedScrollArea = document.createElement("div")
    document.body.appendChild(unrelatedScrollArea)
    fireEvent.scroll(unrelatedScrollArea)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")

    // 下拉列表自身滚动：不关闭
    fireEvent.scroll(screen.getByRole("listbox"))
    expect(trigger.getAttribute("aria-expanded")).toBe("true")

    // 触发按钮的祖先滚动容器滚动：关闭
    const container = trigger.closest(".lx-select") as HTMLElement
    fireEvent.scroll(container.parentElement as HTMLElement)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")

    // 页面级（document，如 window 滚动）滚动：重新打开后关闭
    fireEvent.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    fireEvent.scroll(document)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")

    unrelatedScrollArea.remove()
  })
})
