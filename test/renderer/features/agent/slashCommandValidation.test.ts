import { describe, expect, it } from "vitest"
import {
  collapsePlaceholderArgument,
  getCommandArgumentText,
  getMatchedCommands,
  getMissingRequiredCommand,
  isKnownCommandName,
  parseSlashCommandName,
  resolveExportFormat,
} from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"
import type { TranslationKey } from "@/i18n"

const t = (key: TranslationKey, _params?: Record<string, string | number>): string => key

describe("parseSlashCommandName", () => {
  it("解析首 token 形式的命令名", () => {
    expect(parseSlashCommandName("/cleawr 你好")).toBe("cleawr")
    expect(parseSlashCommandName("/clear")).toBe("clear")
    expect(parseSlashCommandName("  /steer -x")).toBe("steer")
  })

  it("路径与普通文本不视为命令", () => {
    expect(parseSlashCommandName("/usr/local/bin 说明")).toBeNull()
    expect(parseSlashCommandName("你好 /clear")).toBeNull()
    expect(parseSlashCommandName("/skill:foo 内容")).toBeNull()
    expect(parseSlashCommandName("/")).toBeNull()
  })
})

describe("isKnownCommandName", () => {
  it("命中内置命令与别名", () => {
    expect(isKnownCommandName("clear")).toBe(true)
    expect(isKnownCommandName("new")).toBe(true)
    expect(isKnownCommandName("session")).toBe(true)
    expect(isKnownCommandName("resume")).toBe(true)
    expect(isKnownCommandName("steer")).toBe(true)
  })

  it("大小写不敏感，未知名与模板名分别判定", () => {
    expect(isKnownCommandName("CLEAR")).toBe(true)
    expect(isKnownCommandName("cleawr")).toBe(false)
    expect(isKnownCommandName("review", ["review"])).toBe(true)
    expect(isKnownCommandName("Review", ["/review"])).toBe(true)
    expect(isKnownCommandName("other", ["review"])).toBe(false)
  })
})

describe("getCommandArgumentText", () => {
  it("剥离命令名后的分隔符与首个 -", () => {
    expect(getCommandArgumentText("/steer -prompt", "steer")).toBe("prompt")
    expect(getCommandArgumentText("/steer hello world", "steer")).toBe("hello world")
    expect(getCommandArgumentText("/steer -", "steer")).toBe("")
    expect(getCommandArgumentText("/steer", "steer")).toBe("")
    expect(getCommandArgumentText("/copy [all]", "copy")).toBe("[all]")
  })

  it("支持带前导斜杠的命令名（historyPrompt 场景）", () => {
    expect(getCommandArgumentText("/historyPrompt -query", "/historyPrompt")).toBe("query")
    expect(getCommandArgumentText("/historyPrompt 面板", "/historyPrompt")).toBe("面板")
  })
})

describe("collapsePlaceholderArgument", () => {
  it("占位词未编辑时视为未填写", () => {
    expect(collapsePlaceholderArgument("prompt", "prompt")).toBe("")
    expect(collapsePlaceholderArgument("[prompt]", "prompt")).toBe("")
    expect(collapsePlaceholderArgument("【prompt】", "prompt")).toBe("")
    expect(collapsePlaceholderArgument("path", "path")).toBe("")
  })

  it("真实内容原样返回（兼容旧中括号包裹）", () => {
    expect(collapsePlaceholderArgument("改为直接回答", "prompt")).toBe("改为直接回答")
    expect(collapsePlaceholderArgument("[真实内容]", "prompt")).toBe("真实内容")
  })
})

describe("getMissingRequiredCommand", () => {
  it("/steer、/btw 缺失参数时返回命令元信息", () => {
    expect(getMissingRequiredCommand("/steer")?.id).toBe("steer")
    expect(getMissingRequiredCommand("/steer -")?.id).toBe("steer")
    expect(getMissingRequiredCommand("/steer -prompt")?.id).toBe("steer")
    expect(getMissingRequiredCommand("/steer [prompt]")?.id).toBe("steer")
    expect(getMissingRequiredCommand("/btw")?.id).toBe("btw")
    expect(getMissingRequiredCommand("/btw -prompt")?.id).toBe("btw")
  })

  it("参数已填写或非必填命令返回 null", () => {
    expect(getMissingRequiredCommand("/steer -改为直接回答")).toBeNull()
    expect(getMissingRequiredCommand("/btw 这个问题在哪")).toBeNull()
    expect(getMissingRequiredCommand("/clear")).toBeNull()
    expect(getMissingRequiredCommand("/cleawr")).toBeNull()
  })
})

describe("resolveExportFormat", () => {
  it("识别别名并拒绝未知格式", () => {
    expect(resolveExportFormat("")).toBe("html")
    expect(resolveExportFormat("html")).toBe("html")
    expect(resolveExportFormat("md")).toBe("markdown")
    expect(resolveExportFormat("markdown")).toBe("markdown")
    expect(resolveExportFormat("json")).toBe("jsonl")
    expect(resolveExportFormat("jsonl")).toBe("jsonl")
    expect(resolveExportFormat("xml")).toBeNull()
  })
})

describe("getMatchedCommands 内置命令提示与 /export 二级面板", () => {
  it("内置命令 argumentHint 统一为 - 占位符", () => {
    const steer = getMatchedCommands("/steer", [], t).find((c) => c.id === "steer")
    expect(steer?.argumentHint).toBe("-prompt")
    const cd = getMatchedCommands("/cd", [], t).find((c) => c.id === "cd")
    expect(cd?.argumentHint).toBe("-path")
    const copy = getMatchedCommands("/copy", [], t).find((c) => c.id === "copy")
    expect(copy?.argumentHint).toBe("-all")
  })

  it("/export - 列出三个格式选项", () => {
    const options = getMatchedCommands("/export -", [], t)
    expect(options.map((c) => c.id)).toEqual(["export:html", "export:markdown", "export:jsonl"])
    expect(options.map((c) => c.name)).toEqual(["html", "md", "json"])
  })

  it("/export -j 模糊过滤到 json", () => {
    const options = getMatchedCommands("/export -j", [], t)
    expect(options.map((c) => c.id)).toEqual(["export:jsonl"])
  })

  it("/export 无分隔符时仍展示一级命令", () => {
    const options = getMatchedCommands("/export", [], t)
    expect(options.some((c) => c.id === "export")).toBe(true)
  })
})
