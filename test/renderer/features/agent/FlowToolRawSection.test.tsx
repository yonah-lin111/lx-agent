// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { FlowToolGeneric } from "@/features/agent/components/AgentExecutionFlowList/tools/FlowToolGeneric"
import { FlowToolRawSection } from "@/features/agent/components/AgentExecutionFlowList/tools/FlowToolRawSection"

describe("FlowToolRawSection", () => {
  afterEach(cleanup)

  it("参数与结果默认折叠，点击标题后一起展开并可再次收起", () => {
    const { container } = render(
      <FlowToolRawSection
        args={{ command: "pnpm test", timeout: 30 }}
        result="found 12 files"
        toolCallId="call-1"
      />,
    )

    const toggle = screen.getByRole("button", {
      name: /Raw Arguments & Result|原始参数与执行结果/i,
    })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText(/"pnpm test"/)).toBeNull()
    expect(screen.queryByText("found 12 files")).toBeNull()

    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText(/Input Arguments|输入参数/i)).not.toBeNull()
    expect(screen.getByText(/"pnpm test"/)).not.toBeNull()
    expect(screen.getByText(/Execution Result|执行结果/i)).not.toBeNull()
    expect(screen.getByText("found 12 files")).not.toBeNull()
    expect(screen.getByText("ID: call-1")).not.toBeNull()
    expect(container.querySelector(".agent-execution-flow-tool-raw-section")).not.toBeNull()

    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText("found 12 files")).toBeNull()
  })

  it("错误结果展开后追加 ERROR 标注，无结果时只渲染参数", () => {
    const { rerender } = render(<FlowToolRawSection args={{ a: 1 }} result="boom" isError={true} />)
    fireEvent.click(
      screen.getByRole("button", { name: /Raw Arguments & Result|原始参数与执行结果/i }),
    )
    expect(screen.getByText("ERROR")).not.toBeNull()
    expect(screen.getByText("boom")).not.toBeNull()

    cleanup()
    render(<FlowToolRawSection args={{ a: 1 }} />)
    fireEvent.click(
      screen.getByRole("button", { name: /Raw Arguments & Result|原始参数与执行结果/i }),
    )
    expect(screen.getByText(/Input Arguments|输入参数/i)).not.toBeNull()
    expect(screen.queryByText(/Execution Result|执行结果/i)).toBeNull()
    expect(rerender).toBeDefined()
  })
})

describe("FlowToolGeneric", () => {
  afterEach(cleanup)

  it("无独立正文的通用工具直接内联展示参数与结果，不提供折叠", () => {
    const { container } = render(
      <FlowToolGeneric content={{ toolName: "ls", args: { path: "src" }, result: "a.ts" }} />,
    )

    const rawSection = container.querySelector(".agent-execution-flow-tool-raw-section")
    expect(rawSection).not.toBeNull()
    expect(rawSection?.getAttribute("data-collapsible")).toBe("false")

    // 参数与结果直接可见，且不存在折叠开关
    expect(screen.getByText(/"path": "src"/)).not.toBeNull()
    expect(screen.getByText("a.ts")).not.toBeNull()
    expect(
      screen.queryByRole("button", { name: /Raw Arguments & Result|原始参数与执行结果/i }),
    ).toBeNull()
  })
})
