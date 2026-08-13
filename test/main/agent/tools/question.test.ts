import type { QuestionAnswer } from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import { createQuestionTool } from "@/agent/tools/question"

const toolText = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.find((block) => block.type === "text")?.text ?? ""

describe("question 工具", () => {
  it("参数校验：questions 1..4，options 2..4", () => {
    const tool = createQuestionTool({ askQuestion: async () => [] })
    expect(tool.inputSchema.safeParse({ questions: [] }).success).toBe(false)
    expect(
      tool.inputSchema.safeParse({
        questions: [
          { question: "q1" },
          { question: "q2" },
          { question: "q3" },
          { question: "q4" },
          { question: "q5" },
        ],
      }).success,
    ).toBe(false)
    expect(
      tool.inputSchema.safeParse({ questions: [{ question: "q", options: [{ label: "A" }] }] })
        .success,
    ).toBe(false)
    expect(tool.inputSchema.safeParse({ questions: [{ question: "q" }] }).success).toBe(true)
    expect(
      tool.inputSchema.safeParse({
        questions: [
          {
            question: "q",
            header: "选择",
            multiSelect: true,
            options: [{ label: "A" }, { label: "B" }],
          },
        ],
      }).success,
    ).toBe(true)
  })

  it("executionMode 为 sequential（阻塞交互独占）", () => {
    const tool = createQuestionTool({ askQuestion: async () => [] })
    expect(tool.executionMode).toBe("sequential")
  })

  it("execute 回灌格式化答案（单选/多选）", async () => {
    const tool = createQuestionTool({
      askQuestion: async () => [
        { question: "q1", answer: ["a1"] },
        { question: "q2", answer: ["a2", "b2"] },
      ],
    })
    const result = await tool.execute("t1", { questions: [{ question: "q1" }, { question: "q2" }] })
    expect(toolText(result)).toBe(
      'User answered: "q1"="a1", "q2"="a2,b2". Continue with the answers.',
    )
    expect(result.details).toEqual({
      answers: [
        { question: "q1", answer: ["a1"] },
        { question: "q2", answer: ["a2", "b2"] },
      ],
    })
  })

  it("用户未回答（null）抛错 → error toolResult", async () => {
    const tool = createQuestionTool({ askQuestion: async () => null })
    await expect(tool.execute("t1", { questions: [{ question: "q1" }] })).rejects.toThrow(
      /用户未回答/,
    )
  })

  it("空答案数组抛错", async () => {
    const tool = createQuestionTool({ askQuestion: async (): Promise<QuestionAnswer[]> => [] })
    await expect(tool.execute("t1", { questions: [{ question: "q1" }] })).rejects.toThrow(
      /用户未回答/,
    )
  })
})
