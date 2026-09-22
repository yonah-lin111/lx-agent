import { describe, expect, it } from "vitest"
import {
  getMatchedOpenClawCommands,
  keepsCommandText,
  OPENCLAW_COMMANDS,
  parseOpenClawCommand,
  splitCommandAgentNames,
  toggleCommandAgentName,
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

describe("getMatchedOpenClawCommands 命令可见性", () => {
  const names = (capabilities: { canOnly: boolean; canRestore: boolean }): string[] =>
    getMatchedOpenClawCommands("/", t, capabilities).map((command) => command.name)

  it("单员工且非筛选态：只剩与筛选无关的命令", () => {
    const visible = names({ canOnly: false, canRestore: false })

    expect(visible).not.toContain("/only")
    expect(visible).not.toContain("/all")
    expect(visible).toContain("/clear")
    expect(visible).toContain("/stop")
    expect(visible).toContain("/office")
  })

  it("多员工非筛选态：保留 /only、隐藏 /all", () => {
    const visible = names({ canOnly: true, canRestore: false })

    expect(visible).toContain("/only")
    expect(visible).not.toContain("/all")
  })

  it("筛选态：/only 仍可用于调整，/all 可用", () => {
    const visible = names({ canOnly: true, canRestore: true })

    expect(visible).toContain("/only")
    expect(visible).toContain("/all")
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

  it("解析 /only 与 /all", () => {
    expect(parseOpenClawCommand("/only")).toEqual({ id: "only", args: "" })
    expect(parseOpenClawCommand("/only lily & lucy")).toEqual({
      id: "only",
      args: "lily & lucy",
    })
    expect(parseOpenClawCommand("/all")).toEqual({ id: "all", args: "" })
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
  it("clear 与 only 保留输入文本以支持追加参数", () => {
    expect(keepsCommandText("clear")).toBe(true)
    expect(keepsCommandText("only")).toBe(true)
    expect(keepsCommandText("stop")).toBe(false)
    expect(keepsCommandText("office")).toBe(false)
    expect(keepsCommandText("all")).toBe(false)
  })
})

describe("splitCommandAgentNames", () => {
  it("按 & 拆分并去空", () => {
    expect(splitCommandAgentNames("lily & lucy")).toEqual(["lily", "lucy"])
    expect(splitCommandAgentNames(" lily ")).toEqual(["lily"])
    expect(splitCommandAgentNames("")).toEqual([])
  })
})

describe("toggleCommandAgentName", () => {
  it("首次选择生成对应命令", () => {
    expect(toggleCommandAgentName("", "clear", "Lily")).toBe("/clear Lily")
    expect(toggleCommandAgentName("/clear", "clear", "Lily")).toBe("/clear Lily")
    expect(toggleCommandAgentName("/only", "only", "Lily")).toBe("/only Lily")
  })

  it("追加第二个员工并用 & 分隔", () => {
    expect(toggleCommandAgentName("/clear Lily", "clear", "Lucy")).toBe("/clear Lily & Lucy")
    expect(toggleCommandAgentName("/only Lily", "only", "Lucy")).toBe("/only Lily & Lucy")
  })

  it("重复选择同名校验忽略大小写并移除", () => {
    expect(toggleCommandAgentName("/clear Lily & Lucy", "clear", "lily")).toBe("/clear Lucy")
    expect(toggleCommandAgentName("/only Lily & Lucy", "only", "Lucy")).toBe("/only Lily")
    expect(toggleCommandAgentName("/only Lily", "only", "Lily")).toBe("/only")
  })

  it("切换命令时丢弃旧命令的参数", () => {
    expect(toggleCommandAgentName("/clear Lily", "only", "Lucy")).toBe("/only Lucy")
  })
})
