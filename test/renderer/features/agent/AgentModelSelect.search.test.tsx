// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentModelSelect } from "@/features/agent/components/AgentModelSelect"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

// 两个 Provider、四个模型：用于验证分组保留与整组隐藏。
const options = [
  {
    label: "Anthropic",
    options: [
      {
        value: "anthropic::claude-3-7-sonnet",
        label: "Claude 3.7 Sonnet",
        variants: ["low", "medium", "high"],
        defaultVariant: "medium",
      },
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

const openMenu = (): void => {
  fireEvent.click(screen.getByRole("button", { name: /gpt-4o/i }))
}

const getSearchInput = (): HTMLInputElement =>
  screen.getByPlaceholderText("Search models...") as HTMLInputElement

describe("AgentModelSelect 搜索", () => {
  afterEach(cleanup)

  it("展开后搜索框不抢占焦点，关闭后重新展开清空搜索词", () => {
    render(<AgentModelSelect value="openai::gpt-4o" onChange={vi.fn()} options={options} />)

    openMenu()
    expect(document.activeElement).not.toBe(getSearchInput())

    fireEvent.change(getSearchInput(), { target: { value: "haiku" } })
    expect(getSearchInput().value).toBe("haiku")

    // 点击触发按钮关闭后再展开。
    openMenu()
    openMenu()

    expect(getSearchInput().value).toBe("")
    expect(screen.getByRole("option", { name: "Claude Haiku" })).not.toBeNull()
  })

  it("按模型名子序列模糊匹配（c37s 命中 Claude 3.7 Sonnet）", () => {
    render(<AgentModelSelect value="openai::gpt-4o" onChange={vi.fn()} options={options} />)

    openMenu()
    fireEvent.change(getSearchInput(), { target: { value: "c37s" } })

    expect(screen.getByRole("option", { name: "Claude 3.7 Sonnet" })).not.toBeNull()
    expect(screen.queryByRole("option", { name: "Claude Haiku" })).toBeNull()
    expect(screen.queryByRole("option", { name: "GPT-4o" })).toBeNull()
    expect(screen.queryByRole("option", { name: "GPT-4o mini" })).toBeNull()
  })

  it("过滤后保留命中模型的 provider 分组标题，无命中分组整组隐藏", () => {
    render(<AgentModelSelect value="openai::gpt-4o" onChange={vi.fn()} options={options} />)

    openMenu()
    fireEvent.change(getSearchInput(), { target: { value: "c37s" } })

    expect(screen.getByText("Anthropic")).not.toBeNull()
    expect(screen.queryByText("OpenAI")).toBeNull()
  })

  it("provider 名不参与匹配：搜索 anthropic 时展示空态", () => {
    render(<AgentModelSelect value="openai::gpt-4o" onChange={vi.fn()} options={options} />)

    openMenu()
    fireEvent.change(getSearchInput(), { target: { value: "anthropic" } })

    expect(screen.getByText("No matching models")).not.toBeNull()
    expect(screen.queryByText("Anthropic")).toBeNull()
  })

  it("触发按钮内联展示思考等级：模型名可省略、等级不省略且无边框", () => {
    render(
      <AgentModelSelect
        value="openai::gpt-4o"
        variant="high"
        onChange={vi.fn()}
        options={[{ value: "openai::gpt-4o", label: "GPT-4o" }]}
      />,
    )

    const variantEl = document.querySelector(".agent-model-variant")
    expect(variantEl).not.toBeNull()
    expect(variantEl?.textContent).toBe("high")
    expect(variantEl?.closest("button")).not.toBeNull()
    expect(variantEl?.className).toContain("shrink-0")
    expect(variantEl?.className).toContain("text-sky-400/80")
    expect(variantEl?.className).not.toContain("truncate")
    expect(variantEl?.className).not.toContain("border")

    const labelEl = document.querySelector(".agent-model-select button > span:first-child")
    expect(labelEl?.className).toContain("min-w-0")
    expect(labelEl?.className).toContain("truncate")
  })
})
