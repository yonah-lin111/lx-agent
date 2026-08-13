import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ historyPath: "" }))

// 历史文件指向临时目录（隔离真实用户数据）。
vi.mock("@/paths", () => ({ getPromptHistoryPath: () => holder.historyPath }))

import { addPromptHistory, getPromptHistory } from "@/services/promptHistoryService"

let tmpDir: string

describe("promptHistoryService", () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "lx-prompt-history-"))
    holder.historyPath = join(tmpDir, "prompt-history.json")
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("无历史文件时返回空数组", () => {
    expect(getPromptHistory()).toEqual([])
  })

  it("追加提示词：新→旧排列，写回文件后可再次读取", () => {
    addPromptHistory("你好")
    const result = addPromptHistory("继续")

    expect(result).toEqual(["继续", "你好"])
    expect(getPromptHistory()).toEqual(["继续", "你好"])

    const saved = JSON.parse(readFileSync(holder.historyPath, "utf8")) as unknown
    expect(saved).toEqual(["继续", "你好"])
  })

  it("跳过空白与连续重复", () => {
    addPromptHistory("   ")
    addPromptHistory("你好")
    addPromptHistory("你好")
    addPromptHistory("继续")

    expect(getPromptHistory()).toEqual(["继续", "你好"])
  })

  it("超过上限截断为 100 条（保留最近）", () => {
    for (let index = 0; index < 105; index++) addPromptHistory(`p${index}`)

    const history = getPromptHistory()
    expect(history).toHaveLength(100)
    expect(history[0]).toBe("p104")
    expect(history[99]).toBe("p5")
  })

  it("文件损坏或结构非法时回退空数组", () => {
    writeFileSync(holder.historyPath, "{ invalid json", "utf8")
    expect(getPromptHistory()).toEqual([])

    writeFileSync(holder.historyPath, JSON.stringify({ "proj-1": ["x"] }), "utf8")
    expect(getPromptHistory()).toEqual([])
  })
})
