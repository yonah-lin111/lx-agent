// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LxSelect, type LxSelectGroup, type LxSelectOption } from "@/components/ui/LxSelect"

// 两个分组、四个选项：用于验证分组保留与整组隐藏。
const options: (LxSelectOption<string> | LxSelectGroup<string>)[] = [
  {
    label: "Anthropic",
    options: [
      { value: "anthropic::claude-3-7-sonnet", label: "Claude 3.7 Sonnet" },
      { value: "anthropic::claude-haiku", label: "Claude Haiku" },
    ],
  },
  {
    label: "OpenAI",
    options: [
      { value: "openai::gpt-4o", label: "GPT-4o" },
      { value: "openai::gpt-4o-mini", label: "GPT-4o mini" },
    ],
  },
]

const openMenu = (): HTMLElement => {
  const trigger = screen.getByRole("button", { expanded: false })
  fireEvent.click(trigger)
  return trigger
}

const getSearchInput = (): HTMLInputElement =>
  screen.getByPlaceholderText("Search") as HTMLInputElement

describe("LxSelect 搜索", () => {
  afterEach(cleanup)

  it("默认渲染搜索框且不抢占焦点，全量展示选项", () => {
    render(<LxSelect value="openai::gpt-4o" onChange={vi.fn()} options={options} />)

    openMenu()

    expect(getSearchInput()).not.toBeNull()
    expect(document.activeElement).not.toBe(getSearchInput())
    expect(screen.getAllByRole("option")).toHaveLength(4)
  })

  it("searchable={false} 时不渲染搜索框", () => {
    render(
      <LxSelect searchable={false} value="openai::gpt-4o" onChange={vi.fn()} options={options} />,
    )

    openMenu()

    expect(screen.queryByPlaceholderText("Search")).toBeNull()
    expect(screen.getAllByRole("option")).toHaveLength(4)
  })

  it("按子序列模糊过滤（c37s 命中 Claude 3.7 Sonnet）", () => {
    render(<LxSelect value="openai::gpt-4o" onChange={vi.fn()} options={options} />)

    openMenu()
    fireEvent.change(getSearchInput(), { target: { value: "c37s" } })

    expect(screen.getByRole("option", { name: "Claude 3.7 Sonnet" })).not.toBeNull()
    expect(screen.queryByRole("option", { name: "Claude Haiku" })).toBeNull()
    expect(screen.queryByRole("option", { name: "GPT-4o" })).toBeNull()
    expect(screen.queryByRole("option", { name: "GPT-4o mini" })).toBeNull()
  })

  it("组名不参与匹配，无命中分组整组隐藏，全无命中展示空态文案", () => {
    render(<LxSelect value="openai::gpt-4o" onChange={vi.fn()} options={options} />)

    openMenu()
    fireEvent.change(getSearchInput(), { target: { value: "c37s" } })

    expect(screen.getByText("Anthropic")).not.toBeNull()
    expect(screen.queryByText("OpenAI")).toBeNull()

    fireEvent.change(getSearchInput(), { target: { value: "anthropic" } })
    expect(screen.getByText("No matching options")).not.toBeNull()
    expect(screen.queryAllByRole("option")).toHaveLength(0)
  })

  it("关闭后重新展开清空搜索词，恢复全量列表", () => {
    render(<LxSelect value="openai::gpt-4o" onChange={vi.fn()} options={options} />)

    const trigger = openMenu()
    fireEvent.change(getSearchInput(), { target: { value: "haiku" } })
    expect(getSearchInput().value).toBe("haiku")

    fireEvent.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(trigger)
    expect(getSearchInput().value).toBe("")
    expect(screen.getByRole("option", { name: "Claude Haiku" })).not.toBeNull()
  })

  it("过滤后点选命中项仍正确回调", () => {
    const handleChange = vi.fn()
    render(<LxSelect value="openai::gpt-4o" onChange={handleChange} options={options} />)

    openMenu()
    fireEvent.change(getSearchInput(), { target: { value: "haiku" } })
    fireEvent.mouseDown(screen.getByRole("option", { name: "Claude Haiku" }))

    expect(handleChange).toHaveBeenCalledWith("anthropic::claude-haiku")
  })
})
