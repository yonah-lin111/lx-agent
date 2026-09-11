// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  OpenClawInput,
  type OpenClawInputPicker,
} from "@/features/openclaw/components/OpenClawInput"
import { OpenClawTargetSelect } from "@/features/openclaw/components/OpenClawTargetSelect"

const offices = [
  {
    id: "office-1",
    name: "研发中心",
    agents: [
      { id: "agent-a", name: "架构师" },
      { id: "agent-b", name: "前端工程" },
    ],
  },
  {
    id: "office-2",
    name: "运营中心",
    agents: [{ id: "agent-c", name: "运营助手" }],
  },
]

describe("OpenClawTargetSelect & OpenClawInput UI", () => {
  afterEach(() => {
    cleanup()
  })

  it("OpenClawTargetSelect 能正确渲染当前办公区与选中员工数，并触发切换事件", () => {
    const onSelectOffice = vi.fn()
    const onToggleAgent = vi.fn()

    render(
      <OpenClawTargetSelect
        offices={offices}
        selectedOfficeId="office-1"
        selectedAgentIds={["agent-a"]}
        onSelectOffice={onSelectOffice}
        onToggleAgent={onToggleAgent}
      />,
    )

    const btn = screen.getByRole("button")
    expect(btn.textContent).toContain("研发中心 · 架构师")

    // 打开下拉
    fireEvent.click(btn)
    expect(screen.getByText("运营中心")).not.toBeNull()

    // 切换办公区
    fireEvent.click(screen.getByText("运营中心"))
    expect(onSelectOffice).toHaveBeenCalledWith("office-2")

    // 点击员工多选
    fireEvent.click(screen.getByText("前端工程"))
    expect(onToggleAgent).toHaveBeenCalledWith("agent-b")
  })

  it("OpenClawInput 正确渲染语音按钮、目标选择器与发送按钮", () => {
    const onSend = vi.fn()
    const onStop = vi.fn()

    render(
      <OpenClawInput
        value="Hello OpenClaw"
        onChange={vi.fn()}
        onSend={onSend}
        onStop={onStop}
        candidates={[]}
        onCommand={vi.fn()}
        offices={offices}
        selectedOfficeId="office-1"
        selectedAgentIds={["agent-a"]}
        onSelectOffice={vi.fn()}
        onToggleAgent={vi.fn()}
      />,
    )

    expect(screen.getByText("研发中心 · 架构师")).not.toBeNull()
    const sendBtn = screen.getByRole("button", { name: "Send" })
    expect(sendBtn).not.toBeNull()
    fireEvent.click(sendBtn)
    expect(onSend).toHaveBeenCalled()
  })
})

const baseInputProps = {
  onChange: vi.fn(),
  onSend: vi.fn(),
  onStop: vi.fn(),
  candidates: [],
  onCommand: vi.fn(),
}

const composePicker: OpenClawInputPicker = {
  key: "session:compose",
  commandId: "clear",
  title: "选择员工",
  emptyText: "无员工",
  multiSelect: true,
  items: [{ id: "agent-a", label: "架构师" }],
  onPick: vi.fn(),
}

const executePicker: OpenClawInputPicker = {
  key: "session:execute",
  title: "新建会话",
  emptyText: "无员工",
  items: [{ id: "agent-a", label: "架构师" }],
  onPick: vi.fn(),
}

describe("OpenClawInput 命令面板交互（对齐 AgentInput）", () => {
  afterEach(() => {
    cleanup()
  })

  it("输入 /clear 直接进入二级选择面板（不经一级命令面板）", async () => {
    const { rerender } = render(<OpenClawInput {...baseInputProps} value="" picker={null} />)

    rerender(<OpenClawInput {...baseInputProps} value="/cle" picker={null} />)
    expect(await screen.findByText("/clear")).not.toBeNull()

    rerender(<OpenClawInput {...baseInputProps} value="/clear" picker={composePicker} />)
    expect(await screen.findByRole("listbox", { name: "选择员工" })).not.toBeNull()
  })

  it("删除 /clear 失配时在同一事务回落一级命令面板", async () => {
    const { rerender } = render(<OpenClawInput {...baseInputProps} value="" picker={null} />)

    rerender(<OpenClawInput {...baseInputProps} value="/clear" picker={composePicker} />)
    await screen.findByRole("listbox", { name: "选择员工" })

    rerender(<OpenClawInput {...baseInputProps} value="/clea" picker={null} />)
    expect(await screen.findByText("/clear")).not.toBeNull()
    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "选择员工" })).toBeNull()
    })
  })

  it("父级 picker 未及时收回（陈旧 commandId）时仍回落一级命令面板", async () => {
    const { rerender } = render(<OpenClawInput {...baseInputProps} value="" picker={null} />)

    rerender(<OpenClawInput {...baseInputProps} value="/clear" picker={composePicker} />)
    await screen.findByRole("listbox", { name: "选择员工" })

    rerender(<OpenClawInput {...baseInputProps} value="/clea" picker={composePicker} />)
    expect(await screen.findByText("/clear")).not.toBeNull()
  })

  it("office 显式面板不随文本变化关闭", async () => {
    const onPickerClose = vi.fn()
    const officePicker: OpenClawInputPicker = {
      key: "office",
      title: "选择办公区",
      emptyText: "无办公区",
      items: [{ id: "office-1", label: "研发中心" }],
      onPick: vi.fn(),
    }
    const { rerender } = render(
      <OpenClawInput
        {...baseInputProps}
        value=""
        picker={officePicker}
        onPickerClose={onPickerClose}
      />,
    )
    await screen.findByRole("listbox", { name: "选择办公区" })

    rerender(
      <OpenClawInput
        {...baseInputProps}
        value="hello"
        picker={officePicker}
        onPickerClose={onPickerClose}
      />,
    )

    expect(screen.getByRole("listbox", { name: "选择办公区" })).not.toBeNull()
    expect(onPickerClose).not.toHaveBeenCalled()
  })

  it("execute 显式面板不随文本变化关闭", async () => {
    const onPickerClose = vi.fn()
    const { rerender } = render(
      <OpenClawInput
        {...baseInputProps}
        value=""
        picker={executePicker}
        onPickerClose={onPickerClose}
      />,
    )
    await screen.findByRole("listbox", { name: "新建会话" })

    rerender(
      <OpenClawInput
        {...baseInputProps}
        value="hello"
        picker={executePicker}
        onPickerClose={onPickerClose}
      />,
    )

    expect(screen.getByRole("listbox", { name: "新建会话" })).not.toBeNull()
    expect(onPickerClose).not.toHaveBeenCalled()
  })

  it("一级面板模糊选中 /clear 后写入规范命令文本", async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <OpenClawInput {...baseInputProps} onChange={onChange} value="" picker={null} />,
    )

    rerender(<OpenClawInput {...baseInputProps} onChange={onChange} value="/cle" picker={null} />)
    await screen.findByText("/clear")

    const content = document.querySelector(".cm-content")
    expect(content).not.toBeNull()
    fireEvent.keyDown(content as HTMLElement, { key: "Enter" })

    expect(onChange).toHaveBeenLastCalledWith("/clear")
  })
})
