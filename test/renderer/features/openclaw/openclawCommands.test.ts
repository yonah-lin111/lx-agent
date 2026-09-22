import { describe, expect, it } from "vitest"
import {
  getMatchedOpenClawCommands,
  keepsCommandText,
  OPENCLAW_COMMANDS,
  parseOpenClawCommand,
  splitCommandAgentNames,
  toggleAllCommandAgentNames,
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
  const names = (canOnly: boolean): string[] =>
    getMatchedOpenClawCommands("/", t, canOnly).map((command) => command.name)

  it("候选不足两名员工时不展示 /only", () => {
    const visible = names(false)

    expect(visible).not.toContain("/only")
    expect(visible).toContain("/clear")
    expect(visible).toContain("/stop")
    expect(visible).toContain("/office")
  })

  it("候选有多个员工时展示 /only", () => {
    expect(names(true)).toContain("/only")
  })
})

describe("getMatchedOpenClawCommands 模糊规则（对齐 AgentInput）", () => {
  it("tag「Builtin」参与匹配：拼写缺字母仍召回整类", () => {
    expect(getMatchedOpenClawCommands("/bltin", t)).toHaveLength(OPENCLAW_COMMANDS.length)
    expect(getMatchedOpenClawCommands("/BLTIN", t)).toHaveLength(OPENCLAW_COMMANDS.length)
  })

  it("/clear 接受 new 别名", () => {
    expect(getMatchedOpenClawCommands("/new", t).map((command) => command.name)).toEqual(["/clear"])
  })

  it("本地化描述不参与匹配", () => {
    const zhT = ((key: string): string =>
      key === "openclaw.commandClearDesc" ? "选择员工新建对话" : key) as never

    expect(getMatchedOpenClawCommands("/选择", zhT)).toHaveLength(0)
    expect(getMatchedOpenClawCommands("/cl", zhT).map((command) => command.name)).toContain(
      "/clear",
    )
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

  it("解析 /only", () => {
    expect(parseOpenClawCommand("/only")).toEqual({ id: "only", args: "" })
    expect(parseOpenClawCommand("/only lily & lucy")).toEqual({
      id: "only",
      args: "lily & lucy",
    })
  })

  it("/all 已移除", () => {
    expect(parseOpenClawCommand("/all")).toBeNull()
    expect(OPENCLAW_COMMANDS.some((command) => command.name === "/all")).toBe(false)
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

describe("toggleAllCommandAgentNames", () => {
  it("未全选时一次性写入全部候选并去重", () => {
    expect(toggleAllCommandAgentNames("", "clear", ["Lily", "Lucy"])).toBe("/clear Lily & Lucy")
    expect(toggleAllCommandAgentNames("/clear Lily", "clear", ["Lily", "Lucy"])).toBe(
      "/clear Lily & Lucy",
    )
    expect(toggleAllCommandAgentNames("", "clear", ["Lily", "Lily", "Lucy", " "])).toBe(
      "/clear Lily & Lucy",
    )
  })

  it("已全选时清空参数回到裸命令（忽略大小写）", () => {
    expect(toggleAllCommandAgentNames("/clear Lily & Lucy", "clear", ["lily", "lucy"])).toBe(
      "/clear",
    )
  })

  it("候选为空时清空参数", () => {
    expect(toggleAllCommandAgentNames("/clear Lily", "clear", [])).toBe("/clear")
  })
})
