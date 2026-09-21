// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
  FlowToolArgsSection,
  FlowToolResultSection,
} from "@/features/agent/components/AgentExecutionFlowList/tools/FlowToolSections"

describe("FlowToolArgsSection", () => {
  afterEach(cleanup)

  it("默认折叠参数 JSON，点击标题后展开并可再次收起", () => {
    const { container } = render(
      <FlowToolArgsSection args={{ command: "pnpm test", timeout: 30 }} toolCallId="call-1" />,
    )

    const toggle = screen.getByRole("button", { name: /Input Arguments|输入参数/i })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText(/"pnpm test"/)).toBeNull()
    expect(screen.getByText("ID: call-1")).not.toBeNull()

    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText(/"pnpm test"/)).not.toBeNull()
    expect(container.querySelector(".agent-execution-flow-tool-args-section")).not.toBeNull()

    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText(/"pnpm test"/)).toBeNull()
  })
})

describe("FlowToolResultSection", () => {
  afterEach(cleanup)

  it("默认展示结果内容，错误态追加 ERROR 标注", () => {
    const { rerender } = render(<FlowToolResultSection result="found 12 files" />)

    expect(screen.getByText(/Execution Result|执行结果/i)).not.toBeNull()
    expect(screen.getByText("found 12 files")).not.toBeNull()
    expect(screen.queryByText("ERROR")).toBeNull()

    rerender(<FlowToolResultSection result="boom" isError={true} />)
    expect(screen.getByText("ERROR")).not.toBeNull()
    expect(screen.getByText("boom")).not.toBeNull()
  })
})
