import { describe, expect, it } from "vitest"
import { jsonSchemaToZod } from "@/agent/mcp/jsonSchemaToZod"

describe("jsonSchemaToZod", () => {
  it("转换 object（properties + required 区分必选/可选）", () => {
    const schema = jsonSchemaToZod({
      type: "object",
      properties: {
        path: { type: "string" },
        count: { type: "integer" },
        flag: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["path"],
    })
    expect(schema.safeParse({ path: "a", count: 1, flag: true, tags: ["x"] }).success).toBe(true)
    // path 必填
    expect(schema.safeParse({ count: 1 }).success).toBe(false)
    // 可选字段省略合法
    expect(schema.safeParse({ path: "a" }).success).toBe(true)
  })

  it("转换数组与标量类型", () => {
    expect(
      jsonSchemaToZod({ type: "array", items: { type: "number" } }).safeParse([1, 2]).success,
    ).toBe(true)
    expect(
      jsonSchemaToZod({ type: "array", items: { type: "number" } }).safeParse(["x"]).success,
    ).toBe(false)
    expect(jsonSchemaToZod({ type: "string" }).safeParse(1).success).toBe(false)
    expect(jsonSchemaToZod({ type: "number" }).safeParse("x").success).toBe(false)
    expect(jsonSchemaToZod({ type: "null" }).safeParse(null).success).toBe(true)
  })

  it("转换 enum（全字符串）", () => {
    const schema = jsonSchemaToZod({ type: "string", enum: ["a", "b"] })
    expect(schema.safeParse("a").success).toBe(true)
    expect(schema.safeParse("c").success).toBe(false)
  })

  it("单值 enum 用 literal", () => {
    const schema = jsonSchemaToZod({ enum: ["only"] })
    expect(schema.safeParse("only").success).toBe(true)
    expect(schema.safeParse("other").success).toBe(false)
  })

  it("anyOf 简化为联合（单分支退化）", () => {
    const union = jsonSchemaToZod({ anyOf: [{ type: "string" }, { type: "number" }] })
    expect(union.safeParse("x").success).toBe(true)
    expect(union.safeParse(1).success).toBe(true)
    expect(union.safeParse(true).success).toBe(false)

    const single = jsonSchemaToZod({ anyOf: [{ type: "boolean" }] })
    expect(single.safeParse(true).success).toBe(true)
    expect(single.safeParse("x").success).toBe(false)
  })

  it("有 type: object 时忽略 anyOf 约束片段，顶层仍为 object", () => {
    // codebase-memory check_index_coverage 形态：anyOf 仅表达"paths/scopes 二选一必填"。
    const schema = jsonSchemaToZod({
      type: "object",
      properties: {
        project: { type: "string" },
        paths: { type: "array", items: { type: "string" } },
        scopes: { type: "array", items: { type: "string" } },
      },
      required: ["project"],
      anyOf: [{ required: ["paths"] }, { required: ["scopes"] }],
    })
    // 顶层必须是 object（provider 校验要求），而非 anyOf 片段产生的松散 record。
    expect((schema.toJSONSchema() as { type: unknown }).type).toBe("object")
    expect(schema.safeParse({ project: "p", paths: ["a"] }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false) // project 必填
    expect(schema.safeParse({ project: "p" }).success).toBe(true) // 可选字段省略合法
  })

  it("无法无损转换降级宽松 schema", () => {
    // oneOf / 未知 type / 混合 enum / 非对象输入 → 宽松 record（仅接受对象参数）。
    const inputs: unknown[] = [
      { oneOf: [{ type: "string" }] },
      { type: "unknown-type" },
      { enum: ["a", 1] },
      "not-object",
      null,
      undefined,
    ]
    for (const input of inputs) {
      const schema = jsonSchemaToZod(input)
      expect(schema.safeParse({ anything: true }).success).toBe(true)
    }
  })
})
