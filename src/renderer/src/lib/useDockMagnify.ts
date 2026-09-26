import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  computeDockMagnifyLayout,
  type DockDistanceMode,
  type DockMagnifyItem,
} from "@/lib/dockMagnify"

// Dock 放大轴：x 用于水平条，y 用于纵向列表。
export type DockMagnifyAxis = "x" | "y"

// Dock 放大配置。
export interface UseDockMagnifyOptions {
  // 领域条件开关（如侧栏折叠）；系统“减少动态效果”由 Hook 内部统一阻断。
  enabled: boolean
  axis: DockMagnifyAxis
  maxScale: number
  influenceRadiusPx: number
  distanceMode?: DockDistanceMode
  // 缩放基点：bottom 用于底边贴合的图标条，center 用于列表行与标签。
  origin?: "center" | "bottom"
}

// Dock 放大行为返回值。
export interface UseDockMagnifyResult<T extends HTMLElement> {
  containerRef: React.RefObject<T | null>
  registerItem: (key: string, node: HTMLElement | null) => void
  handlePointerMove: (event: React.PointerEvent<T>) => void
  resetTransforms: () => void
}

// 悬停跟随与复位过渡时长。
const FOLLOW_DURATION_MS = 150
const RESET_DURATION_MS = 200
// 交互过渡缓动曲线。
const TRANSITION_TIMING = "cubic-bezier(0.22, 1, 0.36, 1)"

// 变换值取整，避免超长小数写入内联样式。
const roundOffset = (value: number): number => Math.round(value * 100) / 100
const roundScale = (value: number): number => Math.round(value * 1000) / 1000

/**
 * 为容器内的子项提供 macOS Dock 式光标跟随放大：距离感应缩放 + 邻居推挤 + 平滑复位。
 * 热路径直接写 DOM style，不触发 React 重渲染；系统减少动态效果时整体禁用。
 */
export const useDockMagnify = <T extends HTMLElement>({
  enabled,
  axis,
  maxScale,
  influenceRadiusPx,
  distanceMode = "center",
  origin = "center",
}: UseDockMagnifyOptions): UseDockMagnifyResult<T> => {
  const containerRef = useRef<T | null>(null)
  const itemNodesRef = useRef(new Map<string, HTMLElement>())
  const layoutRef = useRef<Array<{ node: HTMLElement; item: DockMagnifyItem }> | null>(null)
  const [isMotionAllowed, setIsMotionAllowed] = useState(false)

  // 跟随系统“减少动态效果”：开启时不做放大，仅保留静态悬停。
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = (): void => setIsMotionAllowed(!media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  const isEnabled = enabled && isMotionAllowed

  // 复位所有变换并按场景选择过渡时长。
  const clearTransforms = useCallback((durationMs: number): void => {
    layoutRef.current = null
    for (const node of itemNodesRef.current.values()) {
      node.style.transitionDuration = `${durationMs}ms`
      node.style.transform = ""
    }
  }, [])

  const resetTransforms = useCallback((): void => {
    clearTransforms(RESET_DURATION_MS)
  }, [clearTransforms])

  // 登记子项并初始化其过渡样式；节点集合变化时失效布局缓存（展开/折叠、增删与重排）。
  const registerItem = useCallback(
    (key: string, node: HTMLElement | null): void => {
      layoutRef.current = null
      if (!node) {
        itemNodesRef.current.delete(key)
        return
      }
      itemNodesRef.current.set(key, node)
      node.style.transformOrigin = origin === "bottom" ? "bottom center" : "center"
      node.style.transitionProperty = "transform"
      node.style.transitionDuration = `${FOLLOW_DURATION_MS}ms`
      node.style.transitionTimingFunction = TRANSITION_TIMING
    },
    [origin],
  )

  // 禁用时立即复位，避免残留放大态。
  useEffect(() => {
    if (!isEnabled) clearTransforms(RESET_DURATION_MS)
  }, [isEnabled, clearTransforms])

  // 容器滚动与窗口尺寸变化会失效基线几何，复位后由下次移动重新测量。
  useEffect(() => {
    if (!isEnabled) return
    const container = containerRef.current
    const handleReset = (): void => resetTransforms()
    window.addEventListener("resize", handleReset)
    container?.addEventListener("scroll", handleReset, { passive: true })
    return () => {
      window.removeEventListener("resize", handleReset)
      container?.removeEventListener("scroll", handleReset)
    }
  }, [isEnabled, resetTransforms])

  // 以当前 DOM 几何重建基线，供移动计算复用。
  const measureLayout = (): Array<{ node: HTMLElement; item: DockMagnifyItem }> | null => {
    const container = containerRef.current
    if (!container) return null
    const containerRect = container.getBoundingClientRect()
    const containerStart = axis === "x" ? containerRect.left : containerRect.top
    const entries: Array<{ node: HTMLElement; item: DockMagnifyItem }> = []
    for (const node of itemNodesRef.current.values()) {
      const rect = node.getBoundingClientRect()
      const start = (axis === "x" ? rect.left : rect.top) - containerStart
      const size = axis === "x" ? rect.width : rect.height
      entries.push({ node, item: { center: start + size / 2, size } })
    }
    entries.sort((a, b) => a.item.center - b.item.center)
    layoutRef.current = entries
    return entries
  }

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<T>): void => {
      if (!isEnabled || event.pointerType === "touch") return
      const container = containerRef.current
      if (!container) return
      const entries = layoutRef.current ?? measureLayout()
      if (!entries || entries.length === 0) return

      const containerRect = container.getBoundingClientRect()
      const pointer =
        axis === "x" ? event.clientX - containerRect.left : event.clientY - containerRect.top
      const layout = computeDockMagnifyLayout(
        pointer,
        entries.map((entry) => entry.item),
        { maxScale, influenceRadiusPx, distanceMode },
      )

      entries.forEach((entry, index) => {
        const transform = layout[index]
        if (!transform) return
        const translate = `${axis === "x" ? "translateX" : "translateY"}(${roundOffset(transform.offset)}px)`
        entry.node.style.transitionDuration = `${FOLLOW_DURATION_MS}ms`
        entry.node.style.transform = `${translate} scale(${roundScale(transform.scale)})`
      })
    },
    [isEnabled, axis, maxScale, influenceRadiusPx, distanceMode],
  )

  return { containerRef, registerItem, handlePointerMove, resetTransforms }
}
