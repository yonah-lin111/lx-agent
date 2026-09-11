import type { ModelPricing } from "@shared/contracts/usage"
import type { LanguageModelUsage } from "ai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  recordModelCall,
  resolveModelPricing,
  resolveProjectId,
  setUsageLogRecordedListener,
  toUsage,
} from "@/agent/usageRecorder"

const { getSession, getModelProviderSettings, record } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getModelProviderSettings: vi.fn(),
  record: vi.fn(),
}))

vi.mock("@/services/agentSessionService", () => ({
  agentSessionService: { getSession },
}))
vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings,
}))
vi.mock("@/services/usageLogService", () => ({
  usageLogService: { record },
}))

const pricing: ModelPricing = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }

beforeEach(() => {
  getSession.mockReset()
  getModelProviderSettings.mockReset()
  record.mockReset()
  setUsageLogRecordedListener(null)
})

describe("toUsage", () => {
  it("完整读取 AI SDK usage 并缺省补零", () => {
    expect(
      toUsage({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        inputTokenDetails: {
          noCacheTokens: 5,
          cacheReadTokens: 3,
          cacheWriteTokens: 2,
        },
        outputTokenDetails: { textTokens: 5, reasoningTokens: 0 },
      } as LanguageModelUsage),
    ).toEqual({ input: 10, output: 5, cacheRead: 3, cacheWrite: 2, totalTokens: 15 })

    expect(toUsage(undefined)).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
    })
  })
})

describe("resolveModelPricing", () => {
  it("优先按 model.id 匹配，其次按配置键匹配，未配置返回 null", () => {
    getModelProviderSettings.mockReturnValue({
      providers: {
        anthropic: {
          models: {
            key1: { id: "claude-x", pricing },
            key2: { id: "claude-y" },
          },
        },
      },
    })

    expect(resolveModelPricing("anthropic", "claude-x")).toEqual(pricing)
    expect(resolveModelPricing("anthropic", "key1")).toEqual(pricing)
    expect(resolveModelPricing("anthropic", "claude-y")).toBeNull()
    expect(resolveModelPricing("anthropic", "unknown")).toBeNull()
    expect(resolveModelPricing("missing", "claude-x")).toBeNull()
  })
})

describe("resolveProjectId", () => {
  it("无会话返回 null，按会话快照项目归属", () => {
    getSession.mockReturnValue({ project_id: "proj-1" })

    expect(resolveProjectId(undefined)).toBeNull()
    expect(resolveProjectId("s1")).toBe("proj-1")

    getSession.mockReturnValue(undefined)
    expect(resolveProjectId("deleted")).toBeNull()
  })
})

describe("recordModelCall", () => {
  it("解析项目与定价后写入日志并广播事件", () => {
    getSession.mockReturnValue({ project_id: "proj-1" })
    getModelProviderSettings.mockReturnValue({
      providers: { anthropic: { models: { key1: { id: "claude-x", pricing } } } },
    })
    const listener = vi.fn()
    setUsageLogRecordedListener(listener)

    recordModelCall({
      sessionId: "s1",
      purpose: "chat",
      provider: "anthropic",
      model: "claude-x",
      tokens: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0 },
      durationMs: 1000,
      status: "success",
    })

    expect(record).toHaveBeenCalledWith(
      {
        sessionId: "s1",
        projectId: "proj-1",
        purpose: "chat",
        provider: "anthropic",
        model: "claude-x",
        tokens: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0 },
        durationMs: 1000,
        status: "success",
        errorMessage: null,
      },
      pricing,
    )
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("显式传入定价时不再读取设置", () => {
    getSession.mockReturnValue(undefined)
    recordModelCall({
      purpose: "title",
      provider: "p",
      model: "m",
      tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
      pricing: null,
    })

    expect(getModelProviderSettings).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }), null)
  })

  it("写入失败只记录错误，不打断模型主流程", () => {
    getSession.mockReturnValue(undefined)
    record.mockImplementation(() => {
      throw new Error("disk full")
    })
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const listener = vi.fn()
    setUsageLogRecordedListener(listener)

    expect(() =>
      recordModelCall({
        purpose: "chat",
        provider: "p",
        model: "m",
        tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
      }),
    ).not.toThrow()
    expect(consoleError).toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()

    consoleError.mockRestore()
  })
})
