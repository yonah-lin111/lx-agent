// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { FlowItemToolContent } from "@/features/agent/components/AgentExecutionFlowList/FlowItemToolContent"
import { AgentToolCallBlock } from "@/features/agent/components/blocks/AgentToolCallBlock"
import { AgentViewImageBlock } from "@/features/agent/components/blocks/AgentViewImageBlock"
import type { ChatBlock, ExecutionToolContent, ViewImageDetails } from "@/features/agent/types"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>
type ToolResultBlock = Extract<ChatBlock, { kind: "toolResult" }>

// 图片结果 fixture（resized=true 以覆盖原图尺寸展示）。
const imageDetails: ViewImageDetails = {
  path: "/repo/artifacts/shot.png",
  mimeType: "image/png",
  detail: "high",
  width: 2048,
  height: 1152,
  sourceWidth: 4096,
  sourceHeight: 2304,
  resized: true,
  sizeBytes: 12345,
}

const toolCallBlock: ToolCallBlock = {
  kind: "toolCall",
  toolCallId: "call-img",
  toolName: "view_image",
  args: { path: "artifacts/shot.png", detail: "high" },
  status: "done",
}

const toolResultBlock: ToolResultBlock = {
  kind: "toolResult",
  toolCallId: "call-img",
  toolName: "view_image",
  text: "Viewed image /repo/artifacts/shot.png",
  isError: false,
  image: imageDetails,
}

afterEach(() => {
  cleanup()
})

describe("AgentViewImageBlock", () => {
  it("渲染缩略图（lx-image 协议）与文件名/尺寸/精度元信息", () => {
    const { container } = render(<AgentViewImageBlock details={imageDetails} />)

    const images = container.querySelectorAll("img")
    expect(images.length).toBeGreaterThan(0)
    expect(images[0]?.getAttribute("src")).toBe("lx-image://local/repo/artifacts/shot.png")
    expect(screen.getByText("shot.png")).not.toBeNull()
    expect(screen.getByText("High detail")).not.toBeNull()
    expect(screen.getByText(/2048×1152/)).not.toBeNull()
    expect(screen.getByText(/source 4096×2304/)).not.toBeNull()
    // 其他工具的摘要行格式：直角 icon + 参数行，图片缩进在参数下方。
    expect(container.querySelector(".agent-tool-call-summary .agent-tool-corner")).not.toBeNull()
    expect(
      container.querySelector(".agent-tool-call-summary .agent-view-image-thumbnail"),
    ).not.toBeNull()
  })

  it("original 精度显示 Original detail", () => {
    render(
      <AgentViewImageBlock details={{ ...imageDetails, detail: "original", resized: false }} />,
    )
    expect(screen.getByText("Original detail")).not.toBeNull()
    // 未缩放时不显示原图尺寸后缀
    expect(screen.queryByText(/source /)).toBeNull()
  })
})

describe("AgentToolCallBlock view_image 分派", () => {
  it("消息流渲染图片专用块", () => {
    const { container } = render(
      <AgentToolCallBlock toolCall={toolCallBlock} toolResult={toolResultBlock} />,
    )
    expect(container.querySelector(".agent-view-image-block")).not.toBeNull()
  })

  it("无结果（流式中/错误）回退通用渲染", () => {
    const errorResult: ToolResultBlock = {
      ...toolResultBlock,
      isError: true,
      text: "view_image is not allowed",
      image: undefined,
    }
    const { container } = render(
      <AgentToolCallBlock toolCall={toolCallBlock} toolResult={errorResult} />,
    )
    expect(container.querySelector(".agent-view-image-block")).toBeNull()
    expect(screen.getByText("View_image")).not.toBeNull()
  })
})

describe("FlowItemToolContent view_image 分派", () => {
  const flowContent: ExecutionToolContent = {
    toolName: "view_image",
    toolCallId: "call-img",
    args: { path: "artifacts/shot.png", detail: "high" },
    result: "Viewed image /repo/artifacts/shot.png",
    isError: false,
    durationMs: 128,
    image: imageDetails,
  }

  it("执行流程渲染图片块而非通用块", () => {
    const { container } = render(<FlowItemToolContent content={flowContent} />)
    expect(container.querySelector(".agent-execution-flow-tool-view-image")).not.toBeNull()
    expect(container.querySelector(".agent-execution-flow-tool-generic")).toBeNull()
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "lx-image://local/repo/artifacts/shot.png",
    )
  })

  it("缺少 image 数据时回退通用块", () => {
    const { container } = render(
      <FlowItemToolContent content={{ ...flowContent, image: undefined }} />,
    )
    expect(container.querySelector(".agent-execution-flow-tool-view-image")).toBeNull()
    expect(container.querySelector(".agent-execution-flow-tool-generic")).not.toBeNull()
  })
})
