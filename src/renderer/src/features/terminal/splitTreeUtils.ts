import type { SplitDirection, SplitNode } from "@/features/terminal/types"

/**
 * 递归收集分屏树中所有存在的叶子节点 paneId。
 */
export const collectAllPaneIds = (node: SplitNode): string[] => {
  if (node.type === "leaf") {
    return [node.paneId]
  }
  return [...collectAllPaneIds(node.children[0]), ...collectAllPaneIds(node.children[1])]
}

/**
 * 递归在目标叶子节点处进行二叉分割。
 */
export const splitNodeAt = (
  node: SplitNode,
  targetPaneId: string,
  newPaneId: string,
  direction: SplitDirection,
): SplitNode => {
  if (node.type === "leaf") {
    if (node.paneId === targetPaneId) {
      return {
        type: "split",
        id: `split_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        direction,
        ratio: 0.5,
        children: [
          { type: "leaf", paneId: targetPaneId },
          { type: "leaf", paneId: newPaneId },
        ],
      }
    }
    return node
  }

  return {
    type: "split",
    id: node.id || `split_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    direction: node.direction,
    ratio: node.ratio ?? 0.5,
    children: [
      splitNodeAt(node.children[0], targetPaneId, newPaneId, direction),
      splitNodeAt(node.children[1], targetPaneId, newPaneId, direction),
    ],
  }
}

/**
 * 递归从分屏树中移除指定叶子节点，并自动折叠父容器。
 * 若整棵树被清空则返回 null。
 */
export const removeNodeAt = (node: SplitNode, targetPaneId: string): SplitNode | null => {
  if (node.type === "leaf") {
    return node.paneId === targetPaneId ? null : node
  }

  const left = removeNodeAt(node.children[0], targetPaneId)
  const right = removeNodeAt(node.children[1], targetPaneId)

  // 1. 左右都被删除：整棵子树消失
  if (!left && !right) return null
  // 2. 左边被删除：右边节点提升顶替父容器
  if (!left && right) return right
  // 3. 右边被删除：左边节点提升顶替父容器
  if (left && !right) return left

  // 4. 左右均保留：维持原容器结构
  return {
    type: "split",
    id: node.id || `split_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    direction: node.direction,
    ratio: node.ratio ?? 0.5,
    children: [left as SplitNode, right as SplitNode],
  }
}

/**
 * 递归更新指定容器节点的分屏比例。
 */
export const updateSplitRatioAt = (
  node: SplitNode,
  containerId: string,
  ratio: number,
): SplitNode => {
  if (node.type === "leaf") {
    return node
  }

  if (node.id === containerId) {
    return {
      ...node,
      ratio,
    }
  }

  return {
    ...node,
    children: [
      updateSplitRatioAt(node.children[0], containerId, ratio),
      updateSplitRatioAt(node.children[1], containerId, ratio),
    ],
  }
}
