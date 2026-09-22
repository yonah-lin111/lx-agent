// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  OpenClawInput,
  type OpenClawInputPicker,
} from "@/features/openclaw/components/OpenClawInput"
import { OpenClawTargetSelect } from "@/features/openclaw/components/OpenClawTargetSelect"

const agents = [
  { id: "agent-a", name: "架构师" },
  { id: "agent-b", name: "前端工程" },
]

describe("OpenClawTargetSelect & OpenClawInput UI", () => {
  afterEach(() => {
    cleanup()
  })

  it("OpenClawTargetSelect 按钮按未选中 / 单个 / 多个显示文案", () => {
    const onToggleAgent = vi.fn()
    const { rerender } = render(
      <OpenClawTargetSelect agents={agents} selectedAgentIds={[]} onToggleAgent={onToggleAgent} />,
    )
    expect(screen.getByRole("button").textContent).toContain("Select coworkers")

    rerender(
      <OpenClawTargetSelect
        agents={agents}
        selectedAgentIds={["agent-a"]}
        onToggleAgent={onToggleAgent}
      />,
    )
    expect(screen.getByRole("button").textContent).toContain("架构师")

    rerender(
      <OpenClawTargetSelect
        agents={agents}
        selectedAgentIds={["agent-a", "agent-b"]}
        onToggleAgent={onToggleAgent}
      />,
    )
    expect(screen.getByRole("button").textContent).toContain("2 agents")
  })

  it("OpenClawTargetSelect 面板只列员工，不含办公区分组，点击触发多选回调", () => {
    const onToggleAgent = vi.fn()

    render(
      <OpenClawTargetSelect
        agents={agents}
        selectedAgentIds={["agent-b"]}
        onToggleAgent={onToggleAgent}
      />,
    )

    fireEvent.click(screen.getByRole("button"))

    // 面板只列员工：无办公区分组标题与办公区名。
    expect(screen.queryByText("Switch office")).toBeNull()
    expect(screen.queryByText("研发中心")).toBeNull()
    expect(screen.getByRole("option", { name: "架构师" })).not.toBeNull()
    expect(screen.getByRole("option", { name: "前端工程" }).getAttribute("aria-selected")).toBe(
      "true",
    )

    fireEvent.click(screen.getByRole("option", { name: "架构师" }))
    expect(onToggleAgent).toHaveBeenCalledWith("agent-a")
  })

  it("OpenClawInput 正确渲染语音按钮、员工选择器与发送按钮", () => {
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
        files={[]}
        onFilesChange={vi.fn()}
        agents={agents}
        selectedAgentIds={["agent-a"]}
        onToggleAgent={vi.fn()}
      />,
    )

    expect(screen.getByText("架构师")).not.toBeNull()
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
  files: [],
  onFilesChange: vi.fn(),
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

  it("onlyCommandAvailable 控制 /only 命令的可见性", async () => {
    const { rerender } = render(
      <OpenClawInput {...baseInputProps} value="" picker={null} onlyCommandAvailable />,
    )

    rerender(<OpenClawInput {...baseInputProps} value="/" picker={null} onlyCommandAvailable />)
    expect(await screen.findByText("/only")).not.toBeNull()

    rerender(
      <OpenClawInput {...baseInputProps} value="/" picker={null} onlyCommandAvailable={false} />,
    )
    await waitFor(() => {
      expect(screen.queryByText("/only")).toBeNull()
    })
    expect(screen.queryByText("/all")).toBeNull()
  })

  it("Esc 取消文本派生的二级面板并清空命令文本", async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <OpenClawInput {...baseInputProps} onChange={onChange} value="" picker={null} />,
    )

    rerender(
      <OpenClawInput
        {...baseInputProps}
        onChange={onChange}
        value="/clear"
        picker={composePicker}
      />,
    )
    await screen.findByRole("listbox", { name: "选择员工" })

    const content = document.querySelector(".cm-content")
    expect(content).not.toBeNull()
    fireEvent.keyDown(content as HTMLElement, { key: "Escape" })

    expect(onChange).toHaveBeenLastCalledWith("")
    // 清空只发生一次（避免 dispatch 与显式回调重复触发）。
    const values = onChange.mock.calls.map(([next]) => next)
    expect(values.filter((value) => value === "").length).toBe(1)
  })

  it("Esc 关闭显式面板（/office）时保留输入文本", async () => {
    const onChange = vi.fn()
    const onPickerClose = vi.fn()
    const officePicker: OpenClawInputPicker = {
      key: "office",
      title: "选择办公区",
      emptyText: "无办公区",
      items: [{ id: "office-1", label: "研发中心" }],
      onPick: vi.fn(),
    }

    render(
      <OpenClawInput
        {...baseInputProps}
        onChange={onChange}
        value="hello"
        picker={officePicker}
        onPickerClose={onPickerClose}
      />,
    )
    await screen.findByRole("listbox", { name: "选择办公区" })

    const content = document.querySelector(".cm-content")
    fireEvent.keyDown(content as HTMLElement, { key: "Escape" })

    expect(onPickerClose).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })
})

const clawCandidates = [
  { instanceId: "local", agentId: "lily", name: "Lily", instanceName: "研发中心" },
  { instanceId: "local", agentId: "amy", name: "Amy", instanceName: "研发中心" },
]

describe("OpenClawInput @claw 提及模糊匹配（对齐 AgentInput）", () => {
  afterEach(() => {
    cleanup()
  })

  it("@cla 模糊命中 tag 后整类展示候选", async () => {
    const { rerender } = render(
      <OpenClawInput {...baseInputProps} value="" picker={null} candidates={clawCandidates} />,
    )

    rerender(
      <OpenClawInput {...baseInputProps} value="@cla" picker={null} candidates={clawCandidates} />,
    )

    expect(await screen.findByText("Lily")).not.toBeNull()
    expect(screen.getByText("Amy")).not.toBeNull()
  })

  it("无 claw 前缀时按员工名过滤", async () => {
    const { rerender } = render(
      <OpenClawInput {...baseInputProps} value="" picker={null} candidates={clawCandidates} />,
    )

    rerender(
      <OpenClawInput {...baseInputProps} value="@amy" picker={null} candidates={clawCandidates} />,
    )

    expect(await screen.findByText("Amy")).not.toBeNull()
    expect(screen.queryByText("Lily")).toBeNull()
  })

  it("未知查询不展示提及面板", async () => {
    const { rerender } = render(
      <OpenClawInput {...baseInputProps} value="" picker={null} candidates={clawCandidates} />,
    )

    rerender(
      <OpenClawInput {...baseInputProps} value="@xyz" picker={null} candidates={clawCandidates} />,
    )

    await waitFor(() => {
      expect(screen.queryByText("Lily")).toBeNull()
    })
    expect(screen.queryByText("Amy")).toBeNull()
  })
})
