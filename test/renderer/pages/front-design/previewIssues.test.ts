// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import {
  buildPreviewErrorGuardScript,
  mergePreviewErrors,
  PREVIEW_ERRORS_GLOBAL,
  type RawPreviewError,
  readPreviewErrors,
} from "@/pages/front-design/utils/previewGuard"

const createRaw = (overrides: Partial<RawPreviewError> = {}): RawPreviewError => ({
  level: "error",
  message: "TypeError: x is null",
  source: "script.js:12:5",
  detail: "at init (script.js:12)",
  ...overrides,
})

const passthroughFormat = (
  sample: RawPreviewError,
): {
  message: string
  instruction: string
  detail?: string
} => ({
  message: sample.message,
  instruction: "修复",
  detail: sample.detail,
})

describe("预览错误采集", () => {
  it("守卫脚本包含三类采集入口与全局键名", () => {
    const script = buildPreviewErrorGuardScript()
    expect(script).toContain(PREVIEW_ERRORS_GLOBAL)
    expect(script).toContain("unhandledrejection")
    expect(script).toContain("console.error")
    expect(script).toContain("lx-preview-error-guard")
    // 资源加载错误由 target.tagName 判定后跳过
    expect(script).toContain("tagName")
  })

  it("读取帧内缓冲，非法数据被过滤", () => {
    const doc = {
      defaultView: {
        [PREVIEW_ERRORS_GLOBAL]: [createRaw(), { level: "nope" }, null, "text"],
      },
    } as unknown as Document
    const errors = readPreviewErrors(doc)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe("TypeError: x is null")
  })

  it("文档不可用时返回空数组", () => {
    expect(readPreviewErrors(null)).toEqual([])
    expect(readPreviewErrors({ defaultView: null } as unknown as Document)).toEqual([])
  })

  it("同 message + source 合并计数且重复读取幂等", () => {
    const raw = [createRaw(), createRaw(), createRaw({ message: "Other" })]
    const first = mergePreviewErrors(raw, passthroughFormat)
    const second = mergePreviewErrors(raw, passthroughFormat)

    expect(first).toHaveLength(2)
    expect(first[0].count).toBe(2)
    expect(first[0].id).toBe("runtime:TypeError: x is null|script.js:12:5")
    expect(second.map((issue) => `${issue.id}#${issue.count}`)).toEqual(
      first.map((issue) => `${issue.id}#${issue.count}`),
    )
  })

  it("按出现次数降序展示，最多 10 条", () => {
    const raw = Array.from({ length: 12 }, (_, index) =>
      createRaw({ message: `error-${index}`, source: `s:${index}` }),
    )
    raw.push(createRaw({ message: "error-0", source: "s:0" }))
    const issues = mergePreviewErrors(raw, passthroughFormat)
    expect(issues).toHaveLength(10)
    expect(issues[0].message).toBe("error-0")
    expect(issues[0].count).toBe(2)
  })

  it("console.error 降级为 warning，未捕获异常保持 error", () => {
    const issues = mergePreviewErrors(
      [
        createRaw({ level: "console", message: "warn", source: "console.error" }),
        createRaw({ level: "error", message: "boom", source: "unhandledrejection" }),
      ],
      passthroughFormat,
    )
    const byMessage = new Map(issues.map((issue) => [issue.message, issue.level]))
    expect(byMessage.get("warn")).toBe("warning")
    expect(byMessage.get("boom")).toBe("error")
  })
})
