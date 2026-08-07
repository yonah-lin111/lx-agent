import { describe, expect, it } from "vitest"
import { buildModelsUrlCandidates } from "@/services/modelFetchService"

describe("buildModelsUrlCandidates", () => {
  it("普通根路径拼接 /v1/models", () => {
    expect(buildModelsUrlCandidates("https://api.siliconflow.cn")).toEqual([
      "https://api.siliconflow.cn/v1/models",
    ])
  })

  it("去除末尾斜杠", () => {
    expect(buildModelsUrlCandidates("https://api.example.com/")).toEqual([
      "https://api.example.com/v1/models",
    ])
  })

  it("以 /v1 结尾时拼接 /models", () => {
    expect(buildModelsUrlCandidates("https://api.example.com/v1")).toEqual([
      "https://api.example.com/v1/models",
    ])
  })

  it("智谱 Coding Plan 以 /v4 版本段结尾时，/models 优先于 /v1/models", () => {
    expect(buildModelsUrlCandidates("https://open.bigmodel.cn/api/coding/paas/v4")).toEqual([
      "https://open.bigmodel.cn/api/coding/paas/v4/models",
      "https://open.bigmodel.cn/api/coding/paas/v4/v1/models",
    ])
  })

  it("空 Base URL 返回空候选", () => {
    expect(buildModelsUrlCandidates("")).toEqual([])
    expect(buildModelsUrlCandidates("   ")).toEqual([])
  })

  it("DeepSeek 剥离 /anthropic 后缀补充根路径候选", () => {
    expect(buildModelsUrlCandidates("https://api.deepseek.com/anthropic")).toEqual([
      "https://api.deepseek.com/anthropic/v1/models",
      "https://api.deepseek.com/v1/models",
      "https://api.deepseek.com/models",
    ])
  })

  it("智谱 /api/anthropic 剥离整个兼容子路径", () => {
    expect(buildModelsUrlCandidates("https://open.bigmodel.cn/api/anthropic")).toEqual([
      "https://open.bigmodel.cn/api/anthropic/v1/models",
      "https://open.bigmodel.cn/v1/models",
      "https://open.bigmodel.cn/models",
    ])
  })

  it("百炼剥离 /apps/anthropic 后缀", () => {
    expect(buildModelsUrlCandidates("https://dashscope.aliyuncs.com/apps/anthropic")).toEqual([
      "https://dashscope.aliyuncs.com/apps/anthropic/v1/models",
      "https://dashscope.aliyuncs.com/v1/models",
      "https://dashscope.aliyuncs.com/models",
    ])
  })

  it("阶跃剥离 /step_plan 后缀", () => {
    expect(buildModelsUrlCandidates("https://api.stepfun.com/step_plan")).toEqual([
      "https://api.stepfun.com/step_plan/v1/models",
      "https://api.stepfun.com/v1/models",
      "https://api.stepfun.com/models",
    ])
  })

  it("豆包剥离 /api/coding 后缀", () => {
    expect(buildModelsUrlCandidates("https://ark.cn-beijing.volces.com/api/coding")).toEqual([
      "https://ark.cn-beijing.volces.com/api/coding/v1/models",
      "https://ark.cn-beijing.volces.com/v1/models",
      "https://ark.cn-beijing.volces.com/models",
    ])
  })

  it("Right Codes 剥离 /claude 后缀", () => {
    expect(buildModelsUrlCandidates("https://www.right.codes/claude")).toEqual([
      "https://www.right.codes/claude/v1/models",
      "https://www.right.codes/v1/models",
      "https://www.right.codes/models",
    ])
  })

  it("/api/anthropic 优先剥离完整前缀而非仅 /anthropic", () => {
    expect(buildModelsUrlCandidates("https://api.z.ai/api/anthropic")).toEqual([
      "https://api.z.ai/api/anthropic/v1/models",
      "https://api.z.ai/v1/models",
      "https://api.z.ai/models",
    ])
  })

  it("无兼容后缀的 /api 路径不做剥离", () => {
    expect(buildModelsUrlCandidates("https://openrouter.ai/api")).toEqual([
      "https://openrouter.ai/api/v1/models",
    ])
  })
})
