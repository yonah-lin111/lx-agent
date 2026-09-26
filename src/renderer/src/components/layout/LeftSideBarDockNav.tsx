import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"
import { PRIMARY_NAVIGATION_ITEMS } from "@/lib/navigationItems"

// 导航图标放大上限倍率。
export const DOCK_MAX_SCALE = 1.5
// 光标影响半径（像素）。
export const DOCK_INFLUENCE_RADIUS_PX = 56
// 悬停跟随与离开复位的过渡时长。
const DOCK_FOLLOW_DURATION_MS = 150
const DOCK_RESET_DURATION_MS = 200
// 交互过渡缓动曲线。
const DOCK_TRANSITION_TIMING = "cubic-bezier(0.22, 1, 0.36, 1)"

// 单个导航项相对容器左侧的基线几何。
export interface DockMagnifyItem {
  center: number
  width: number
}

// 单个导航项的放大变换结果。
export interface DockMagnifyTransform {
  scale: number
  translateX: number
}

// 放大计算参数。
export interface DockMagnifyOptions {
  maxScale?: number
  influenceRadiusPx?: number
}

// 距离衰减曲线：(1 - t²)²，t ≥ 1 时归零。
const dockFalloff = (distancePx: number, radiusPx: number): number => {
  if (radiusPx <= 0) return 0
  const ratio = distancePx / radiusPx
  if (ratio >= 1) return 0
  const base = 1 - ratio * ratio
  return base * base
}

// 在 [min, max] 区间内夹取。
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

/**
 * 计算 Dock 放大布局：光标所在点原位锚定，邻居按各自额外宽度向外推开且保持原始间距。
 */
export const computeDockMagnifyLayout = (
  pointerX: number,
  items: readonly DockMagnifyItem[],
  options: DockMagnifyOptions = {},
): DockMagnifyTransform[] => {
  if (items.length === 0) return []
  const maxScale = options.maxScale ?? DOCK_MAX_SCALE
  const influenceRadiusPx = options.influenceRadiusPx ?? DOCK_INFLUENCE_RADIUS_PX

  const scales = items.map(
    (item) => 1 + (maxScale - 1) * dockFalloff(Math.abs(pointerX - item.center), influenceRadiusPx),
  )
  const widths = items.map((item, index) => item.width * scales[index])
  const gaps = items.map((item, index) => {
    if (index === 0) return 0
    const previous = items[index - 1]
    return item.center - item.width / 2 - (previous.center + previous.width / 2)
  })

  // 按放大后的宽度顺序重排，保持各项之间的原始间距。
  const lefts: number[] = []
  items.forEach((item, index) => {
    if (index === 0) {
      lefts.push(item.center - item.width / 2)
      return
    }
    lefts.push(lefts[index - 1] + widths[index - 1] + gaps[index])
  })

  // 光标超出导航条两端时收敛到条边缘，避免整条被拖走。
  const firstItem = items[0]
  const lastItem = items[items.length - 1]
  const stripLeft = firstItem.center - firstItem.width / 2
  const stripRight = lastItem.center + lastItem.width / 2
  const referenceX = clamp(pointerX, stripLeft, stripRight)

  // 锚定项：包含参考点的项，否则取最近项。
  let anchorIndex = 0
  let anchorDistance = Number.POSITIVE_INFINITY
  items.forEach((item, index) => {
    const left = item.center - item.width / 2
    const right = item.center + item.width / 2
    const distance =
      referenceX < left ? left - referenceX : referenceX > right ? referenceX - right : 0
    if (distance < anchorDistance) {
      anchorDistance = distance
      anchorIndex = index
    }
  })

  const anchorItem = items[anchorIndex]
  const anchorRatio =
    anchorItem.width > 0
      ? clamp((referenceX - (anchorItem.center - anchorItem.width / 2)) / anchorItem.width, 0, 1)
      : 0
  const anchorNewX = lefts[anchorIndex] + anchorRatio * widths[anchorIndex]
  const shift = referenceX - anchorNewX

  return items.map((item, index) => ({
    scale: scales[index],
    translateX: lefts[index] + widths[index] / 2 + shift - item.center,
  }))
}

/**
 * 将变换值取整后格式化为 transform 字符串，避免超长小数写入内联样式。
 */
const toDockTransform = ({ scale, translateX }: DockMagnifyTransform): string =>
  `translateX(${Math.round(translateX * 100) / 100}px) scale(${Math.round(scale * 1000) / 1000})`

// 底部导航属性。
interface LeftSideBarDockNavProps {
  // 侧栏是否折叠：折叠态为纵向静态列表，不启用放大。
  isCollapsed: boolean
}

/**
 * 渲染主导航项，并在展开态提供 macOS Dock 式光标跟随放大效果。
 */
export const LeftSideBarDockNav = ({ isCollapsed }: LeftSideBarDockNavProps): React.JSX.Element => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Array<HTMLSpanElement | null>>([])
  const baseLayoutRef = useRef<DockMagnifyItem[] | null>(null)
  const [isMagnifyAllowed, setIsMagnifyAllowed] = useState(false)

  // 跟随系统“减少动态效果”：开启时不做放大，仅保留静态悬停。
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = (): void => setIsMagnifyAllowed(!media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  const isMagnifyEnabled = isMagnifyAllowed && !isCollapsed

  // 复位所有变换并按场景选择过渡时长。
  const clearTransforms = useCallback((durationMs: number): void => {
    baseLayoutRef.current = null
    for (const node of itemRefs.current) {
      if (!node) continue
      node.style.transitionDuration = `${durationMs}ms`
      node.style.transform = ""
    }
  }, [])

  // 折叠或禁用放大时立即复位，避免残留放大态。
  useEffect(() => {
    if (!isMagnifyEnabled) clearTransforms(DOCK_RESET_DURATION_MS)
  }, [isMagnifyEnabled, clearTransforms])

  // 悬停期间窗口尺寸变化会失效基线几何，直接复位由下次移动重新测量。
  useEffect(() => {
    if (!isMagnifyEnabled) return
    const handleResize = (): void => clearTransforms(DOCK_RESET_DURATION_MS)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [isMagnifyEnabled, clearTransforms])

  // 以当前 DOM 几何重建基线，供移动计算复用。
  const measureBaseLayout = useCallback((): DockMagnifyItem[] | null => {
    const container = containerRef.current
    if (!container) return null
    const containerLeft = container.getBoundingClientRect().left
    const items: DockMagnifyItem[] = []
    for (const node of itemRefs.current) {
      if (!node) return null
      const rect = node.getBoundingClientRect()
      items.push({ center: rect.left + rect.width / 2 - containerLeft, width: rect.width })
    }
    baseLayoutRef.current = items
    return items
  }, [])

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!isMagnifyEnabled || event.pointerType === "touch") return
    const container = containerRef.current
    if (!container) return
    const items = baseLayoutRef.current ?? measureBaseLayout()
    if (!items) return
    const pointerX = event.clientX - container.getBoundingClientRect().left
    const layout = computeDockMagnifyLayout(pointerX, items)
    itemRefs.current.forEach((node, index) => {
      if (!node) return
      node.style.transitionDuration = `${DOCK_FOLLOW_DURATION_MS}ms`
      node.style.transform = toDockTransform(layout[index])
    })
  }

  const resetTransforms = (): void => clearTransforms(DOCK_RESET_DURATION_MS)

  return (
    <div
      ref={containerRef}
      className={`sidebar-dock-nav mt-2 flex shrink-0 gap-1 transition-transform duration-300 ease-in-out ${
        isCollapsed
          ? "items-center -translate-x-[1px] flex-col"
          : "translate-x-0 flex-row justify-center"
      }`}
      onPointerCancel={resetTransforms}
      onPointerLeave={resetTransforms}
      onPointerMove={handlePointerMove}
    >
      {PRIMARY_NAVIGATION_ITEMS.map(({ icon: Icon, labelKey, path }, index) => {
        const isActive = pathname === path
        const label = t(labelKey)
        return (
          <span
            key={path}
            ref={(node) => {
              itemRefs.current[index] = node
            }}
            className="sidebar-dock-item flex will-change-transform"
            style={{
              transformOrigin: "bottom center",
              transitionProperty: "transform",
              transitionDuration: `${DOCK_FOLLOW_DURATION_MS}ms`,
              transitionTimingFunction: DOCK_TRANSITION_TIMING,
            }}
          >
            <LxIconButton
              aria-current={isActive ? "page" : undefined}
              aria-label={t("nav.openPage", { name: label })}
              title={{ content: label, placement: isCollapsed ? "right" : "top" }}
              highlighted={isActive}
              onClick={() => navigate(path)}
              size="small"
            >
              <Icon />
            </LxIconButton>
          </span>
        )
      })}
    </div>
  )
}
