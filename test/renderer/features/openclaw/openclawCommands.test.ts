import { describe, expect, it } from "vitest"
import {
  getMatchedOpenClawCommands,
  matchOpenClawCommand,
  OPENCLAW_COMMANDS,
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

describe("matchOpenClawCommand", () => {
  it("精确匹配命令名", () => {
    expect(matchOpenClawCommand("/clear")).toBe("clear")
    expect(matchOpenClawCommand("  /office  ")).toBe("office")
  })

  it("忽略大小写", () => {
    expect(matchOpenClawCommand("/CLEAR")).toBe("clear")
  })

  it("带参数或未知命令返回 null", () => {
    expect(matchOpenClawCommand("/clear now")).toBeNull()
    expect(matchOpenClawCommand("/unknown")).toBeNull()
  })
})
