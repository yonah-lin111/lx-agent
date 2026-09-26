// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GrillQuestionCard } from "@/features/agent/components/blocks/GrillQuestionCard"
import type { GrillQuestionData } from "@/features/agent/types"

describe("GrillQuestionCard", () => {
  const grill: GrillQuestionData = {
    question: "导出格式选 CSV 还是 XLSX？",
    recommendation: "CSV，依赖为零，用户可直接用 Excel 打开。",
    example: "就像 Excel 的“另存为 CSV”，双击就能打开，不需要装额外软件。",
    raw: [
      "<grill_question>",
      "问题: 导出格式选 CSV 还是 XLSX？",
      "推荐: CSV，依赖为零，用户可直接用 Excel 打开。",
      "推荐举例说明: 就像 Excel 的“另存为 CSV”，双击就能打开，不需要装额外软件。",
      "</grill_question>",
    ].join("\n"),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("渲染问题 / 推荐 / 推荐举例说明三段与徽标", () => {
    render(<GrillQuestionCard grill={grill} />)

    expect(screen.getByText("Grill Me")).toBeTruthy()
    expect(screen.getByText("Question")).toBeTruthy()
    expect(screen.getByText("Recommendation")).toBeTruthy()
    expect(screen.getByText("Recommendation example")).toBeTruthy()
    expect(screen.getByText(/CSV 还是 XLSX/)).toBeTruthy()
    expect(screen.getByText(/依赖为零/)).toBeTruthy()
    expect(screen.getByText(/另存为 CSV/)).toBeTruthy()
  })

  it("渲染 A/B/C 选项行：键位徽标与选项文案逐行展示", () => {
    render(
      <GrillQuestionCard
        grill={{
          ...grill,
          question: "你要的“登录”是哪一种？",
          options: [
            { key: "A", text: "本地应用锁，纯离线。" },
            { key: "B", text: "云端账号登录，需要后端。" },
            { key: "C", text: "其他（请具体描述）。" },
          ],
        }}
      />,
    )

    expect(screen.getByText("A")).toBeTruthy()
    expect(screen.getByText("B")).toBeTruthy()
    expect(screen.getByText("C")).toBeTruthy()
    expect(screen.getByText("本地应用锁，纯离线。")).toBeTruthy()
    expect(screen.getByText("云端账号登录，需要后端。")).toBeTruthy()
    expect(screen.getByText("其他（请具体描述）。")).toBeTruthy()
  })

  it("缺少字段时不渲染对应段落（流式渐进补全）", () => {
    render(
      <GrillQuestionCard
        grill={{ ...grill, recommendation: "", example: "", isStreaming: true }}
        isStreaming
      />,
    )

    expect(screen.getByText("Question")).toBeTruthy()
    expect(screen.queryByText("Recommendation")).toBeNull()
    expect(screen.queryByText("Recommendation example")).toBeNull()
  })

  it("三字段全空时展示生成中占位", () => {
    render(
      <GrillQuestionCard
        grill={{ ...grill, question: "", recommendation: "", example: "" }}
        isStreaming
      />,
    )

    expect(screen.getByText("Generating question...")).toBeTruthy()
  })

  it("点击复制按钮写入原始提问文本", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    })

    render(<GrillQuestionCard grill={grill} />)
    fireEvent.click(screen.getByLabelText("Copy question"))

    expect(writeTextMock).toHaveBeenCalledWith(grill.raw)
  })
})
