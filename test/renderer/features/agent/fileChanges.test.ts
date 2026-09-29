import type { AgentDiff } from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import type { ExecutionStep, ExecutionToolContent } from "@/features/agent/types"
import {
  buildFileChangeSummary,
  buildFlowFileChangesByStepId,
  isSameFileChangeSummary,
} from "@/features/agent/utils/fileChanges"

// 构造展示用 diff。
const makeDiff = (
  fileName: string | undefined,
  added: number,
  removed: number,
  lines: AgentDiff["lines"] = [],
): AgentDiff => ({
  ...(fileName !== undefined ? { fileName } : {}),
  lines,
  truncated: false,
  stats: { added, removed },
})

// 构造工具执行步骤。
const makeToolStep = (
  id: string,
  turnIndex: number,
  content: ExecutionToolContent,
  stepIndex = 1,
): ExecutionStep => ({
  id,
  turnIndex,
  stepIndex,
  kind: "tool",
  title: content.toolName,
  status: "done",
  toolContent: content,
})

// 构造助手回复步骤。
const makeAssistantStep = (id: string, turnIndex: number, stepIndex = 1): ExecutionStep => ({
  id,
  turnIndex,
  stepIndex,
  kind: "assistant",
  title: "assistant",
  status: "done",
  assistantContent: { text: "done" },
})

describe("buildFileChangeSummary", () => {
  it("空输入返回 null", () => {
    expect(buildFileChangeSummary([])).toBeNull()
  })

  it("单文件按 stats 汇总，定位行取首个新增行", () => {
    const summary = buildFileChangeSummary([
      {
        diff: makeDiff("src/a.ts", 3, 1, [
          { type: "context", oldLine: 1, newLine: 1, text: "keep" },
          { type: "del", oldLine: 2, text: "old" },
          { type: "add", newLine: 2, text: "new" },
        ]),
      },
    ])

    expect(summary).not.toBeNull()
    expect(summary?.files).toEqual([{ filePath: "src/a.ts", added: 3, removed: 1, line: 2 }])
    expect(summary?.totalAdded).toBe(3)
    expect(summary?.totalRemoved).toBe(1)
  })

  it("无新增行时定位行回退到首个删除行，再回退到 1", () => {
    const deletionOnly = buildFileChangeSummary([
      {
        diff: makeDiff("src/del.ts", 0, 2, [{ type: "del", oldLine: 7, text: "gone" }]),
      },
    ])
    expect(deletionOnly?.files[0].line).toBe(7)

    const emptyLines = buildFileChangeSummary([{ diff: makeDiff("src/empty.ts", 0, 0) }])
    expect(emptyLines?.files[0].line).toBe(1)
  })

  it("同一文件多次修改累加增删行并保留首次出现顺序与定位行", () => {
    const summary = buildFileChangeSummary([
      {
        diff: makeDiff("src/a.ts", 10, 2, [{ type: "add", newLine: 5, text: "x" }]),
      },
      { diff: makeDiff("src/b.ts", 1, 0) },
      {
        diff: makeDiff("src/a.ts", 3, 1, [{ type: "add", newLine: 99, text: "y" }]),
      },
    ])

    expect(summary?.files).toEqual([
      { filePath: "src/a.ts", added: 13, removed: 3, line: 5 },
      { filePath: "src/b.ts", added: 1, removed: 0, line: 1 },
    ])
    expect(summary?.totalAdded).toBe(14)
    expect(summary?.totalRemoved).toBe(3)
  })

  it("文件名缺省时回退到工具参数路径，均缺失则跳过；全部跳过返回 null", () => {
    const summary = buildFileChangeSummary([
      { diff: makeDiff(undefined, 2, 0), fallbackPath: "src/fallback.ts" },
      { diff: makeDiff(undefined, 9, 9) },
      { diff: makeDiff("   ", 5, 5), fallbackPath: "  " },
    ])

    expect(summary?.files).toEqual([{ filePath: "src/fallback.ts", added: 2, removed: 0, line: 1 }])

    expect(buildFileChangeSummary([{ diff: makeDiff(undefined, 1, 1) }])).toBeNull()
  })
})

describe("buildFlowFileChangesByStepId", () => {
  it("按 turn 聚合写工具 diff 并挂到该轮最后一个 assistant 步骤（附带用户消息时间戳）", () => {
    const steps: ExecutionStep[] = [
      {
        id: "user-1",
        turnIndex: 1,
        stepIndex: 1,
        kind: "user",
        title: "修改文件",
        status: "done",
        timestamp: 1000,
        userContent: { text: "修改文件" },
      },
      makeAssistantStep("assistant-early", 1, 2),
      makeToolStep(
        "tool-1",
        1,
        { toolName: "edit", args: { filePath: "src/a.ts" }, diff: makeDiff("src/a.ts", 4, 1) },
        3,
      ),
      makeAssistantStep("assistant-final", 1, 4),
      makeToolStep(
        "tool-2",
        2,
        {
          toolName: "apply_patch",
          args: {},
          diffs: [makeDiff("src/b.ts", 2, 0), makeDiff("src/c.ts", 1, 1)],
        },
        5,
      ),
      makeAssistantStep("assistant-turn2", 2, 6),
      // turn 3 只有工具没有 assistant：不产生条目
      makeToolStep(
        "tool-3",
        3,
        { toolName: "write", args: { path: "src/d.ts" }, diff: makeDiff("src/d.ts", 1, 0) },
        7,
      ),
    ]

    const result = buildFlowFileChangesByStepId(steps)

    expect(result.has("assistant-early")).toBe(false)
    expect(result.get("assistant-final")?.summary.files).toEqual([
      { filePath: "src/a.ts", added: 4, removed: 1, line: 1 },
    ])
    expect(result.get("assistant-final")?.userMessageTimestamp).toBe(1000)
    expect(result.get("assistant-turn2")?.summary.files).toEqual([
      { filePath: "src/b.ts", added: 2, removed: 0, line: 1 },
      { filePath: "src/c.ts", added: 1, removed: 1, line: 1 },
    ])
    // turn 2 无用户步骤：无回退时间戳
    expect(result.get("assistant-turn2")?.userMessageTimestamp).toBeUndefined()
    expect(result.size).toBe(2)
  })

  it("忽略非文件修改工具与无 diff 的写工具步骤", () => {
    const steps: ExecutionStep[] = [
      makeToolStep("tool-read", 1, { toolName: "read", args: { filePath: "src/a.ts" } }, 1),
      makeToolStep("tool-no-diff", 1, { toolName: "edit", args: { filePath: "src/a.ts" } }, 2),
      makeAssistantStep("assistant-1", 1, 3),
    ]

    const result = buildFlowFileChangesByStepId(steps)
    expect(result.size).toBe(0)
  })
})

describe("isSameFileChangeSummary", () => {
  const base = buildFileChangeSummary([{ diff: makeDiff("src/a.ts", 1, 2) }])

  it("同一引用或同结构判定相等", () => {
    expect(isSameFileChangeSummary(base, base)).toBe(true)
    const same = buildFileChangeSummary([{ diff: makeDiff("src/a.ts", 1, 2) }])
    expect(isSameFileChangeSummary(base, same)).toBe(true)
  })

  it("缺省值处理与结构差异判定", () => {
    expect(isSameFileChangeSummary(undefined, null)).toBe(true)
    expect(isSameFileChangeSummary(base, null)).toBe(false)
    expect(isSameFileChangeSummary(null, base)).toBe(false)

    const differentAdded = buildFileChangeSummary([{ diff: makeDiff("src/a.ts", 9, 2) }])
    expect(isSameFileChangeSummary(base, differentAdded)).toBe(false)

    const differentFile = buildFileChangeSummary([{ diff: makeDiff("src/b.ts", 1, 2) }])
    expect(isSameFileChangeSummary(base, differentFile)).toBe(false)

    const moreFiles = buildFileChangeSummary([
      { diff: makeDiff("src/a.ts", 1, 2) },
      { diff: makeDiff("src/b.ts", 0, 0) },
    ])
    expect(isSameFileChangeSummary(base, moreFiles)).toBe(false)
  })
})
