import { z } from "zod"

// 无法无损转换的 schema（oneOf / $ref / 未知 type）降级为宽松 schema，运行时透传。
const LOOSE_SCHEMA = z.record(z.string(), z.unknown())

// JSON Schema 值（宽松形态，防御任意 server 输入）。
type JsonSchemaValue = unknown

// 读取对象字段；非对象返回 undefined。
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

// 读取字符串数组字段；非数组返回 []。
const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

// enum → zod：全字符串用 z.enum，单值用 z.literal，混合值降级宽松。
const enumToZod = (values: unknown[]): z.ZodType => {
  if (values.length === 0) return LOOSE_SCHEMA
  if (values.every((value) => typeof value === "string")) {
    return z.enum(values as [string, ...string[]])
  }
  if (values.length === 1) return z.literal(values[0] as string | number | boolean)
  return LOOSE_SCHEMA
}

// 判断 anyOf 分支是否为承载类型的分支；仅约束片段（如 `{ required: [...] }`）不是替代类型。
const isTypeBearing = (value: unknown): boolean => {
  const record = asRecord(value)
  if (!record) return false
  return (
    record.type !== undefined ||
    record.properties !== undefined ||
    record.enum !== undefined ||
    record.items !== undefined
  )
}

/**
 * 递归将 MCP 工具的 JSON Schema 转换为 zod schema。
 *
 * 支持 enum、object（properties/required）、string/number/integer/boolean/null、array；
 * `anyOf` 仅在无明确 `type` 时作为替代类型联合（忽略仅含 `required` 等约束的片段，
 * 否则 `{ type: "object" } + anyOf 片段` 这类常见 schema 会丢失顶层 object 类型）；
 * 无法无损转换（oneOf、自引用 $ref、未知 type）时降级 `z.record(z.unknown())`，运行时透传。
 */
export const jsonSchemaToZod = (schema: JsonSchemaValue): z.ZodType => {
  const value = asRecord(schema)
  if (!value) return LOOSE_SCHEMA

  if (Array.isArray(value.enum)) return enumToZod(value.enum)

  const type = Array.isArray(value.type) ? value.type[0] : value.type
  switch (type) {
    case "string":
      return z.string()
    case "number":
      return z.number()
    case "integer":
      return z.number().int()
    case "boolean":
      return z.boolean()
    case "null":
      return z.null()
    case "array": {
      const items = asRecord(value.items)
      return z.array(items ? jsonSchemaToZod(items) : z.unknown())
    }
    case "object": {
      const properties = asRecord(value.properties) ?? {}
      const required = new Set(asStringArray(value.required))
      const shape: Record<string, z.ZodType> = {}
      for (const [key, propertySchema] of Object.entries(properties)) {
        const converted = jsonSchemaToZod(propertySchema)
        shape[key] = required.has(key) ? converted : converted.optional()
      }
      return z.object(shape)
    }
  }

  // 无明确 type：anyOf 尝试按替代类型并联合（单分支退化；无类型承载分支则落入宽松）。
  const anyOf = value.anyOf
  if (Array.isArray(anyOf) && anyOf.length > 0) {
    const alternatives = anyOf.filter(isTypeBearing).map(jsonSchemaToZod)
    if (alternatives.length === 1) return alternatives[0]!
    if (alternatives.length > 1) {
      return z.union(alternatives as [z.ZodType, z.ZodType, ...z.ZodType[]])
    }
  }

  return LOOSE_SCHEMA
}
