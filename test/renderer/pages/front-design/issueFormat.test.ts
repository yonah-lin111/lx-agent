// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { en } from "@/i18n/locales/en"
import { zh } from "@/i18n/locales/zh"
import type { A11yFinding } from "@/pages/front-design/types"
import { formatA11yFinding, formatRuntimeError } from "@/pages/front-design/utils/issueFormat"

// 桩翻译：把 key 与参数回显，便于断言映射与参数传递。
const t = ((key: string, params?: Record<string, string | number>): string =>
  params ? `${key}|${JSON.stringify(params)}` : key) as never

const getNested = (source: unknown, path: string): string | undefined => {
  const parts = path.split(".")
  let current: unknown = source
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof current === "string" ? current : undefined
}

const RULE_KEYS = [
  "frontDesign.issuesRuleAlt",
  "frontDesign.issuesRuleAccessibleName",
  "frontDesign.issuesRuleContrast",
  "frontDesign.issuesRuleTargetSize",
  "frontDesign.issuesRuleFormLabel",
  "frontDesign.issuesRuleLang",
  "frontDesign.issuesInstructionAlt",
  "frontDesign.issuesInstructionAccessibleName",
  "frontDesign.issuesInstructionContrast",
  "frontDesign.issuesInstructionTargetSize",
  "frontDesign.issuesInstructionFormLabel",
  "frontDesign.issuesInstructionLang",
  "frontDesign.issuesInstructionRuntime",
]

describe("体检问题格式化", () => {
  it("六条规则的文案与指令键在中英文词典中都存在", () => {
    for (const key of RULE_KEYS) {
      expect(getNested(en, key), `en 缺失 ${key}`).toBeTruthy()
      expect(getNested(zh, key), `zh 缺失 ${key}`).toBeTruthy()
    }
  })

  it("对比度发现携带实测比值与阈值", () => {
    const finding: A11yFinding = {
      rule: "contrast",
      level: "error",
      selector: "body>p:nth-child(1)",
      values: { ratio: "2.10", threshold: "4.5" },
    }
    const issue = formatA11yFinding(finding, t)
    expect(issue.group).toBe("a11y")
    expect(issue.rule).toBe("contrast")
    expect(issue.selector).toBe("body>p:nth-child(1)")
    expect(issue.message).toContain("frontDesign.issuesRuleContrast")
    expect(issue.message).toContain('"ratio":"2.10"')
    expect(issue.message).toContain('"threshold":"4.5"')
    expect(issue.id).toBe("a11y:contrast:body>p:nth-child(1)")
  })

  it("无选择器的 lang 规则 id 使用 document 兜底", () => {
    const issue = formatA11yFinding({ rule: "lang", level: "warning" }, t)
    expect(issue.id).toBe("a11y:lang:document")
    expect(issue.selector).toBeUndefined()
    expect(issue.count).toBe(1)
  })

  it("运行时错误拼接来源并保留堆栈", () => {
    const formatted = formatRuntimeError(
      {
        level: "console",
        message: "boom",
        source: "console.error",
        detail: "stack",
      },
      t,
    )
    expect(formatted.message).toBe("boom (console.error)")
    expect(formatted.instruction).toContain("boom (console.error)")
    expect(formatted.detail).toBe("stack")
  })
})
