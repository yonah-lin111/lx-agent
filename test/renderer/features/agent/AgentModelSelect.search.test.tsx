// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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

// 两个 Provider、四个模型：用于验证分组保留、整组隐藏与跨分组键盘移动。
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

describe("AgentModelSelect 搜索与键盘交互", () => {
  afterEach(cleanup)

  it("展开后搜索框自动聚焦，关闭后重新展开清空搜索词", async () => {
    render(<AgentModelSelect value="openai::gpt-4o" onChange={vi.fn()} options={options} />)

    openMenu()
    const input = getSearchInput()
    await waitFor(() => expect(document.activeElement).toBe(input))

    fireEvent.change(input, { target: { value: "haiku" } })
    expect(input.value).toBe("haiku")

    // Esc 关闭并把焦点交还触发按钮。
    fireEvent.keyDown(input, { key: "Escape" })
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /gpt-4o/i }))

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

  it("上下键跨分组移动高亮且到边界不循环，回车选中并提交默认思考等级", () => {
    const onChange = vi.fn()
    render(<AgentModelSelect value="openai::gpt-4o" onChange={onChange} options={options} />)

    openMenu()
    const input = getSearchInput()
    const gpt4o = screen.getByRole("option", { name: "GPT-4o" })
    const mini = screen.getByRole("option", { name: "GPT-4o mini" })

    // 展开时高亮定位到当前选中模型（选中态由 aria-selected 承担）。
    expect(gpt4o.getAttribute("aria-selected")).toBe("true")

    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(mini.getAttribute("data-keyboard-active")).toBe("true")
    expect(gpt4o.getAttribute("data-keyboard-active")).toBeNull()

    // 底部边界：到底后再按向下仍停在最后一项。
    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(mini.getAttribute("data-keyboard-active")).toBe("true")

    // 跨分组向上移动到 Anthropic 组首条（Claude 3.7 Sonnet）。
    fireEvent.keyDown(input, { key: "ArrowUp" })
    fireEvent.keyDown(input, { key: "ArrowUp" })
    fireEvent.keyDown(input, { key: "ArrowUp" })
    const sonnet = screen.getByRole("option", { name: "Claude 3.7 Sonnet" })
    expect(sonnet.getAttribute("data-keyboard-active")).toBe("true")
    expect(
      screen.getByRole("option", { name: "Claude Haiku" }).getAttribute("data-keyboard-active"),
    ).toBeNull()

    // 顶部边界：到顶后再按向上仍停在首项。
    fireEvent.keyDown(input, { key: "ArrowUp" })
    expect(sonnet.getAttribute("data-keyboard-active")).toBe("true")

    fireEvent.keyDown(input, { key: "Enter" })

    // 换模型时思考等级随 onChange 一次性提交。
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith("anthropic::claude-3-7-sonnet", "medium")
    // 选中后焦点回到触发按钮。
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /gpt-4o/i }))
  })

  it("搜索后高亮重置到首条命中项，回车提交该模型的默认思考等级", () => {
    const onChange = vi.fn()
    render(<AgentModelSelect value="openai::gpt-4o" onChange={onChange} options={options} />)

    openMenu()
    const input = getSearchInput()
    fireEvent.change(input, { target: { value: "sonnet" } })

    expect(
      screen
        .getByRole("option", { name: "Claude 3.7 Sonnet" })
        .getAttribute("data-keyboard-active"),
    ).toBe("true")

    fireEvent.keyDown(input, { key: "Enter" })
    expect(onChange).toHaveBeenCalledWith("anthropic::claude-3-7-sonnet", "medium")
  })

  it("鼠标悬停与键盘共享高亮，回车选中当前悬停行", () => {
    const onChange = vi.fn()
    render(<AgentModelSelect value="openai::gpt-4o" onChange={onChange} options={options} />)

    openMenu()
    fireEvent.mouseEnter(screen.getByRole("option", { name: "GPT-4o mini" }))
    fireEvent.keyDown(getSearchInput(), { key: "Enter" })

    expect(onChange).toHaveBeenCalledWith("openai::gpt-4o-mini", undefined)
  })

  it("回车选中当前模型时只提交思考等级", () => {
    const onChange = vi.fn()
    const onVariantChange = vi.fn()
    render(
      <AgentModelSelect
        value="anthropic::claude-3-7-sonnet"
        variant="low"
        onChange={onChange}
        onVariantChange={onVariantChange}
        options={options}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /claude 3\.7 sonnet/i }))
    fireEvent.keyDown(getSearchInput(), { key: "Enter" })

    expect(onVariantChange).toHaveBeenCalledWith("low")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("输入法组合态回车不触发选中", () => {
    const onChange = vi.fn()
    render(<AgentModelSelect value="openai::gpt-4o" onChange={onChange} options={options} />)

    openMenu()
    const input = getSearchInput()
    fireEvent.keyDown(input, { key: "Enter", isComposing: true })
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole("option", { name: "GPT-4o" })).not.toBeNull()
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
