import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { createMemoryTool, memoryInputSchema } from "@/agent/tools/memory"

// 与 AI SDK zod4Schema（@ai-sdk/provider-utils）一致的转换参数，验证模型实际收到的 JSON Schema。
const toModelJsonSchema = (): Record<string, unknown> =>
  z.toJSONSchema(memoryInputSchema, { target: "draft-7", io: "input" }) as Record<string, unknown>

describe("memory 工具 JSON Schema 契约", () => {
  const testDir = join(__dirname, "__tmp_memory_schema_test__")

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it("根节点为 type: object，无 oneOf（OpenAI 兼容端点硬约束）", () => {
    const schema = toModelJsonSchema()
    expect(schema.type).toBe("object")
    expect(schema.oneOf).toBeUndefined()
    expect(schema.anyOf).toBeUndefined()
  })

  it("action 必填；scope/type 枚举收窄；旧参数已移除", () => {
    const schema = toModelJsonSchema() as {
      required?: string[]
      properties?: Record<string, { enum?: string[] }>
    }
    expect(schema.required).toEqual(["action"])
    expect(schema.properties?.action?.enum).toEqual(["view", "save", "search", "delete"])
    expect(schema.properties?.scope?.enum).toEqual(["user", "project"])
    expect(schema.properties?.type?.enum).toEqual(["user", "workflow"])

    for (const field of ["name", "content", "query"]) {
      expect(schema.properties).toHaveProperty(field)
    }
    for (const legacyField of ["topic", "path", "description"]) {
      expect(schema.properties).not.toHaveProperty(legacyField)
    }
  })

  it("save 缺失必填字段时返回明确错误且不落盘", async () => {
    const tool = createMemoryTool(testDir, { userRoot: join(testDir, "user-memory") })
    const result = await tool.execute("call_missing", { action: "save", name: "only_name" })
    const first = result.content[0]
    expect(first?.type === "text" ? first.text : "").toContain("Missing required save parameters")
    expect(existsSync(join(testDir, ".lx"))).toBe(false)
  })

  it("search 缺失 query 时返回空查询错误", async () => {
    const tool = createMemoryTool(testDir, { userRoot: join(testDir, "user-memory") })
    const result = await tool.execute("call_no_query", { action: "search" })
    const first = result.content[0]
    expect(first?.type === "text" ? first.text : "").toContain("Empty search query provided.")
  })
})
