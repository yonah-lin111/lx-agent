import { describe, expect, it } from "vitest"
import {
  getMatchedOpenClawCommands,
  keepsCommandText,
  OPENCLAW_COMMANDS,
  parseOpenClawCommand,
  splitClearAgentNames,
  toggleClearAgentName,
} from "@/features/openclaw/openclawCommands"

// 测试用翻译函数：直接回显 key，便于断言。
const t = (key: string): string => key

describe("getMatchedOpenClawCommands", () => {
  it("单独的 / 展示全部命令", () => {
    expect(getMatchedOpenClawCommands("/", t)).toHaveLength(OPENCLAW_COMMANDS.length)
  })

  it("支持命令名前缀模糊匹配", () => {
    const names = getMatchedOpenClawCommands("/cl", t).map((command) => command.name)

    expect(names).toContain("/clear")
  })

  it("命令后跟空格（输入参数）时不再展示面板", () => {
    expect(getMatchedOpenClawCommands("/clear ", t)).toHaveLength(0)
  })

  it("非斜杠输入不展示面板", () => {
    expect(getMatchedOpenClawCommands("hello", t)).toHaveLength(0)
  })
})

describe("parseOpenClawCommand", () => {
  it("解析精确命令与大小写", () => {
    expect(parseOpenClawCommand("/clear")).toEqual({ id: "clear", args: "" })
    expect(parseOpenClawCommand("  /CLEAR  ")).toEqual({ id: "clear", args: "" })
  })

  it("解析命令参数", () => {
    expect(parseOpenClawCommand("/clear lily & lucy")).toEqual({
      id: "clear",
      args: "lily & lucy",
    })
  })

  it("/new 与 /agent 已移除", () => {
    expect(parseOpenClawCommand("/new")).toBeNull()
    expect(parseOpenClawCommand("/agent")).toBeNull()
    expect(OPENCLAW_COMMANDS.some((command) => command.name === "/new")).toBe(false)
    expect(OPENCLAW_COMMANDS.some((command) => command.name === "/agent")).toBe(false)
  })

  it("未知命令返回 null", () => {
    expect(parseOpenClawCommand("/unknown")).toBeNull()
    expect(parseOpenClawCommand("hello")).toBeNull()
  })
})

describe("keepsCommandText", () => {
  it("clear 保留输入文本以支持追加参数", () => {
    expect(keepsCommandText("clear")).toBe(true)
    expect(keepsCommandText("stop")).toBe(false)
    expect(keepsCommandText("office")).toBe(false)
  })
})

describe("splitClearAgentNames", () => {
  it("按 & 拆分并去空", () => {
    expect(splitClearAgentNames("lily & lucy")).toEqual(["lily", "lucy"])
    expect(splitClearAgentNames(" lily ")).toEqual(["lily"])
    expect(splitClearAgentNames("")).toEqual([])
  })
})

describe("toggleClearAgentName", () => {
  it("首次选择生成 /clear 命令", () => {
    expect(toggleClearAgentName("", "Lily")).toBe("/clear Lily")
    expect(toggleClearAgentName("/clear", "Lily")).toBe("/clear Lily")
  })

  it("追加第二个员工并用 & 分隔", () => {
    expect(toggleClearAgentName("/clear Lily", "Lucy")).toBe("/clear Lily & Lucy")
  })

  it("重复选择同名校验忽略大小写并移除", () => {
    expect(toggleClearAgentName("/clear Lily & Lucy", "lily")).toBe("/clear Lucy")
    expect(toggleClearAgentName("/clear Lily", "Lily")).toBe("/clear")
  })
})
