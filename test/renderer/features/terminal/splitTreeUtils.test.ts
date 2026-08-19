import { describe, expect, it } from "vitest"
import {
  collectAllPaneIds,
  removeNodeAt,
  splitNodeAt,
  updateSplitRatioAt,
} from "@/features/terminal/splitTreeUtils"
import type { SplitNode } from "@/features/terminal/types"

describe("splitTreeUtils", () => {
  it("splitNodeAt 支持在叶子节点创建带唯一 id 和 0.5 默认 ratio 的分屏容器", () => {
    const root: SplitNode = { type: "leaf", paneId: "p1" }
    const result = splitNodeAt(root, "p1", "p2", "horizontal")

    expect(result.type).toBe("split")
    if (result.type === "split") {
      expect(result.direction).toBe("horizontal")
      expect(result.ratio).toBe(0.5)
      expect(result.id).toMatch(/^split_/)
      expect(result.children[0]).toEqual({ type: "leaf", paneId: "p1" })
      expect(result.children[1]).toEqual({ type: "leaf", paneId: "p2" })
    }
  })

  it("updateSplitRatioAt 递归更新指定容器的 ratio", () => {
    const root: SplitNode = {
      type: "split",
      id: "split-1",
      direction: "horizontal",
      ratio: 0.5,
      children: [
        { type: "leaf", paneId: "p1" },
        {
          type: "split",
          id: "split-2",
          direction: "vertical",
          ratio: 0.5,
          children: [
            { type: "leaf", paneId: "p2" },
            { type: "leaf", paneId: "p3" },
          ],
        },
      ],
    }

    const updated = updateSplitRatioAt(root, "split-2", 0.7)

    expect(updated.type).toBe("split")
    if (updated.type === "split") {
      expect(updated.ratio).toBe(0.5)
      const child1 = updated.children[1]
      expect(child1.type).toBe("split")
      if (child1.type === "split") {
        expect(child1.ratio).toBe(0.7)
      }
    }
  })

  it("removeNodeAt 移除叶子节点后自动折叠且保留未受影响容器的 id 与 ratio", () => {
    const root: SplitNode = {
      type: "split",
      id: "split-root",
      direction: "horizontal",
      ratio: 0.6,
      children: [
        { type: "leaf", paneId: "p1" },
        {
          type: "split",
          id: "split-nested",
          direction: "vertical",
          ratio: 0.3,
          children: [
            { type: "leaf", paneId: "p2" },
            { type: "leaf", paneId: "p3" },
          ],
        },
      ],
    }

    // 移除 p2，nested 容器折叠为 p3，root 容器保留
    const result = removeNodeAt(root, "p2")
    expect(result).not.toBeNull()
    if (result && result.type === "split") {
      expect(result.id).toBe("split-root")
      expect(result.ratio).toBe(0.6)
      expect(result.children[0]).toEqual({ type: "leaf", paneId: "p1" })
      expect(result.children[1]).toEqual({ type: "leaf", paneId: "p3" })
    }

    // 再移除 p1，root 容器折叠为 p3
    const result2 = removeNodeAt(result!, "p1")
    expect(result2).toEqual({ type: "leaf", paneId: "p3" })

    // 移除最后一个节点，整棵树返回 null
    const result3 = removeNodeAt(result2!, "p3")
    expect(result3).toBeNull()
  })

  it("collectAllPaneIds 收集整棵树的所有 paneId", () => {
    const root: SplitNode = {
      type: "split",
      id: "s1",
      direction: "horizontal",
      ratio: 0.5,
      children: [
        { type: "leaf", paneId: "p1" },
        {
          type: "split",
          id: "s2",
          direction: "vertical",
          ratio: 0.5,
          children: [
            { type: "leaf", paneId: "p2" },
            { type: "leaf", paneId: "p3" },
          ],
        },
      ],
    }

    expect(collectAllPaneIds(root)).toEqual(["p1", "p2", "p3"])
  })
})
