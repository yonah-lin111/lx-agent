import type { QuestionPrompt } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { questionManager } from "@/agent/question/questionManager"

const holder = vi.hoisted(() => ({
  captured: [] as Array<{
    requestId: string
    toolCallId: string
    questions: QuestionPrompt[]
    sessionId: string | null
  }>,
}))

// 重置单例内部状态（module 级单例，测试间清空）。
const resetManager = (): void => {
  const manager = questionManager as unknown as {
    pending: Map<string, unknown>
    sendRequest: unknown
    requestSequence: number
  }
  manager.pending = new Map()
  manager.sendRequest = null
  manager.requestSequence = 0
  holder.captured = []
}

const questions: QuestionPrompt[] = [
  { question: "选哪个？", options: [{ label: "A" }, { label: "B" }] },
]

describe("questionManager", () => {
  beforeEach(() => {
    resetManager()
    questionManager.attachSender((request) => {
      holder.captured.push({
        requestId: request.requestId,
        toolCallId: request.toolCallId,
        questions: request.questions,
        sessionId: request.sessionId,
      })
    })
  })
  afterEach(resetManager)

  it("ask 推送请求并挂起；respond 解析答案", async () => {
    const pending = questionManager.ask(questions, "s1", "tc1")
    expect(holder.captured).toHaveLength(1)
    expect(holder.captured[0]).toMatchObject({ sessionId: "s1", toolCallId: "tc1", questions })

    const answered = [{ question: "选哪个？", answer: ["A"] }]
    expect(questionManager.respond(holder.captured[0].requestId, answered)).toBe(true)
    await expect(pending).resolves.toEqual(answered)
  })

  it("respond(null) 按未回答解析（dismiss）", async () => {
    const pending = questionManager.ask(questions, "s1", "tc1")
    questionManager.respond(holder.captured[0].requestId, null)
    await expect(pending).resolves.toBeNull()
  })

  it("未知 requestId 返回 false", () => {
    expect(questionManager.respond("unknown", [])).toBe(false)
  })

  it("abort 按未回答解析并清理 pending", async () => {
    const controller = new AbortController()
    const pending = questionManager.ask(questions, "s1", "tc1", controller.signal)
    controller.abort()
    await expect(pending).resolves.toBeNull()
    expect((questionManager as unknown as { pending: Map<string, unknown> }).pending.size).toBe(0)
  })

  it("clearSession 清理该会话挂起（按未回答解析），不影响其它会话", async () => {
    const p1 = questionManager.ask(questions, "s1", "tc1")
    const p2 = questionManager.ask(questions, "s2", "tc2")
    expect(holder.captured).toHaveLength(2)

    questionManager.clearSession("s1")
    await expect(p1).resolves.toBeNull()

    // s2 仍挂起，可正常作答。
    const answered = [{ question: "选哪个？", answer: ["B"] }]
    expect(questionManager.respond(holder.captured[1].requestId, answered)).toBe(true)
    await expect(p2).resolves.toEqual(answered)
  })

  it("未接线推送目标按未回答处理（fail-safe）", async () => {
    ;(questionManager as unknown as { sendRequest: unknown }).sendRequest = null
    const pending = questionManager.ask(questions, "s1", "tc1")
    await expect(pending).resolves.toBeNull()
  })
})
