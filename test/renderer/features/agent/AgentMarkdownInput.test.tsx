// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import {
  AgentMarkdownInput,
  type AgentMarkdownInputRef,
} from "@/features/agent/components/AgentInput/AgentMarkdownInput"
import {
  getArgumentSelectionRange,
  getMatchedCommands,
  getMentionQuery,
  getSkillMentionQuery,
  isFuzzyMatch,
} from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    listPromptTemplates: vi.fn().mockResolvedValue([]),
    listSkills: vi
      .fn()
      .mockResolvedValue([
        { name: "test-skill", displayName: "Test Skill", description: "A skill for testing" },
      ]),
    exportSession: vi.fn().mockResolvedValue({ ok: true, filePath: "/path/to/export.html" }),
    copySession: vi.fn().mockResolvedValue({ ok: true, text: "copied markdown" }),
  },
}))

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    searchFiles: vi.fn().mockResolvedValue([{ path: "src/main.ts", isDirectory: false }]),
    searchDirectoryFiles: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: {
    get: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue([]),
  },
}))

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

vi.stubGlobal("requestAnimationFrame", ((cb: () => void) => {
  cb()
  return 0
}) as typeof requestAnimationFrame)

describe("AgentMarkdownInput 工具函数单元测试", () => {
  it("isFuzzyMatch 正确匹配子序列", () => {
    expect(isFuzzyMatch("cmd", "command")).toBe(true)
    expect(isFuzzyMatch("xyz", "command")).toBe(false)
    expect(isFuzzyMatch("", "anything")).toBe(true)
  })

  it("getMatchedCommands 正确检索内置命令", () => {
    const mockT = (key: string) => key
    const clearCmds = getMatchedCommands("/clear", [], mockT)
    expect(clearCmds.some((c) => c.id === "clear")).toBe(true)

    const undoCmds = getMatchedCommands("/un", [], mockT)
    expect(undoCmds.some((c) => c.id === "undo")).toBe(true)

    const steerCmds = getMatchedCommands("/steer", [], mockT)
    expect(steerCmds.some((c) => c.id === "steer")).toBe(true)
  })

  it("getMentionQuery 正确解析 @ 提及输入", () => {
    expect(getMentionQuery("@abc", 4)).toEqual({ start: 0, query: "abc" })
    expect(getMentionQuery("hello @src/file", 15)).toEqual({ start: 6, query: "src/file" })
    expect(getMentionQuery("no-space@fail", 13)).toBeNull()
    expect(getMentionQuery("@has space", 10)).toBeNull()
  })

  it("getSkillMentionQuery 正确解析 $ 技能输入", () => {
    expect(getSkillMentionQuery("$test", 5)).toEqual({ start: 0, query: "test" })
    expect(getSkillMentionQuery("prefix $skill", 13)).toEqual({ start: 7, query: "skill" })
    expect(getSkillMentionQuery("abc$def", 7)).toBeNull()
  })

  it("getArgumentSelectionRange 正确计算参数括号区间", () => {
    const text = "/export [html | md | json]"
    const range = getArgumentSelectionRange(text, "/export".length)
    expect(range.anchor).toBe(8)
    expect(range.head).toBe(26)
  })
})

describe("AgentMarkdownInput 视图与交互测试", () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it("组件正确挂载并暴露 ref 接口 (getValue, setValue, focus, setSelectionRange)", async () => {
    const refHolder: { current: AgentMarkdownInputRef | null } = { current: null }

    const Harness = () => {
      const [val, setVal] = useState("初始内容")
      return (
        <div>
          <AgentMarkdownInput
            ref={(node) => {
              refHolder.current = node
            }}
            value={val}
            onChange={setVal}
            onSend={vi.fn()}
          />
        </div>
      )
    }

    render(<Harness />)
    await act(async () => {})

    expect(refHolder.current).not.toBeNull()
    expect(refHolder.current?.getValue()).toBe("初始内容")

    await act(async () => {
      refHolder.current?.setValue("更新内容")
    })
    expect(refHolder.current?.getValue()).toBe("更新内容")

    expect(() => {
      refHolder.current?.focus()
      refHolder.current?.setSelectionRange(0, 2)
    }).not.toThrow()
  })

  it("回车普通文本触发 onSend", async () => {
    const onSend = vi.fn()
    const Harness = () => {
      const [val, setVal] = useState("你好 Agent")
      return <AgentMarkdownInput value={val} onChange={setVal} onSend={onSend} />
    }

    render(<Harness />)
    await act(async () => {})

    const editor = document.querySelector(".cm-content") as HTMLElement
    expect(editor).not.toBeNull()

    fireEvent.keyDown(editor, { key: "Enter" })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it("在流式状态下 Shift+Enter 触发 delivery='steer' 发送", async () => {
    const onSend = vi.fn()
    const Harness = () => {
      const [val, setVal] = useState("即时纠偏")
      return <AgentMarkdownInput value={val} onChange={setVal} onSend={onSend} isStreaming={true} />
    }

    render(<Harness />)
    await act(async () => {})

    const editor = document.querySelector(".cm-content") as HTMLElement
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: true })
    expect(onSend).toHaveBeenCalledWith({ delivery: "steer" })
  })

  it("输入 /clear 命令并回车触发 onClear", async () => {
    const onClear = vi.fn()
    const onSend = vi.fn()
    const Harness = () => {
      const [val, setVal] = useState("/clear")
      return <AgentMarkdownInput value={val} onChange={setVal} onSend={onSend} onClear={onClear} />
    }

    render(<Harness />)
    await act(async () => {})

    const editor = document.querySelector(".cm-content") as HTMLElement
    fireEvent.keyDown(editor, { key: "Enter" })
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })

  it("输入 /compact 命令并回车触发 onCompact", async () => {
    const onCompact = vi.fn()
    const onSend = vi.fn()
    const Harness = () => {
      const [val, setVal] = useState("/compact")
      return (
        <AgentMarkdownInput value={val} onChange={setVal} onSend={onSend} onCompact={onCompact} />
      )
    }

    render(<Harness />)
    await act(async () => {})

    const editor = document.querySelector(".cm-content") as HTMLElement
    fireEvent.keyDown(editor, { key: "Enter" })
    expect(onCompact).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })

  it("输入 /export 命令并回车调用 agentApi.exportSession", async () => {
    const Harness = () => {
      const [val, setVal] = useState("/export html")
      return <AgentMarkdownInput value={val} onChange={setVal} onSend={vi.fn()} />
    }

    render(<Harness />)
    await act(async () => {})

    const editor = document.querySelector(".cm-content") as HTMLElement
    fireEvent.keyDown(editor, { key: "Enter" })
    expect(agentApi.exportSession).toHaveBeenCalledWith({
      format: "html",
      openAfterExport: true,
    })
  })

  it("输入 /copy 命令并回车调用 agentApi.copySession 并写入剪贴板", async () => {
    const Harness = () => {
      const [val, setVal] = useState("/copy all")
      return <AgentMarkdownInput value={val} onChange={setVal} onSend={vi.fn()} />
    }

    render(<Harness />)
    await act(async () => {})

    const editor = document.querySelector(".cm-content") as HTMLElement
    fireEvent.keyDown(editor, { key: "Enter" })
    expect(agentApi.copySession).toHaveBeenCalledWith({
      target: "markdown",
    })
  })

  it("按下 Esc 键清空输入框已有草稿内容", async () => {
    let currentVal = "草稿文本"
    const Harness = () => {
      const [val, setVal] = useState("草稿文本")
      return (
        <AgentMarkdownInput
          value={val}
          onChange={(newVal) => {
            currentVal = newVal
            setVal(newVal)
          }}
          onSend={vi.fn()}
        />
      )
    }

    render(<Harness />)
    await act(async () => {})

    const editor = document.querySelector(".cm-content") as HTMLElement
    fireEvent.keyDown(editor, { key: "Escape" })
    expect(currentVal).toBe("")
  })
})
