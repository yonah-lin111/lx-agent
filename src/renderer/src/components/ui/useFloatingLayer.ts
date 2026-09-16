import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

// 退场动画时长（对应 animate-tooltip-out），动画结束后才卸载浮层节点。
const LAYER_EXIT_DURATION = 120

// 嵌套浮层注册上下文：portal 渲染到 body 的嵌套组件（LxMenu、LxSelect 下拉、嵌套 Tooltip 气泡等）
// 通过注册自身根元素，避免被父级浮层的「点击外部 / 滚动」逻辑误判为外部而关闭。
export interface TooltipLayerContextValue {
  register: (node: HTMLElement) => void
  unregister: (node: HTMLElement) => void
}

export const TooltipLayerContext = createContext<TooltipLayerContextValue | null>(null)

// 通用浮层关闭配置。
export interface UseFloatingLayerOptions {
  // 浮层是否打开：仅打开时挂载外部点击 / Esc / 滚动关闭监听。
  isOpen: boolean
  // 浮层根节点是否已挂载（退场动画期间仍为 true）。
  active: boolean
  // 浮层根节点（portal 渲染到 body 的气泡 / 下拉列表 / 菜单）。
  rootRef: React.RefObject<HTMLElement | null>
  // 关闭回调。
  onClose: () => void
  // 触发元素等需要视为「层内部」的节点，点击与滚动时不触发关闭。
  insideRefs?: React.RefObject<HTMLElement | null>[]
  // 滚动关闭锚点：滚动容器包含锚点（或页面级滚动）时才关闭；未传时任意外部滚动都会关闭。
  anchorRef?: React.RefObject<HTMLElement | null>
  // 点击浮层外是否关闭（默认 true）。
  closeOnOutsideClick?: boolean
  // 滚动时是否关闭（默认 true）。
  closeOnScroll?: boolean
}

// useFloatingLayer 返回值。
export interface UseFloatingLayerResult {
  // 提供给浮层子树：嵌套 portal 组件注册自身根节点。
  layerContextValue: TooltipLayerContextValue
}

/**
 * 通用浮层关闭逻辑：统一外部 pointerdown 关闭、Esc 关闭、锚点作用域滚动关闭，
 * 并维护嵌套浮层的注册与放行（LxTooltip / LxMenu / LxSelect / AgentModelSelect / OpenClawTargetSelect）。
 */
export const useFloatingLayer = ({
  isOpen,
  active,
  rootRef,
  onClose,
  insideRefs,
  anchorRef,
  closeOnOutsideClick = true,
  closeOnScroll = true,
}: UseFloatingLayerOptions): UseFloatingLayerResult => {
  const parentLayer = useContext(TooltipLayerContext)
  const layerNodesRef = useRef<Set<HTMLElement>>(new Set())
  const insideRefsRef = useRef(insideRefs)

  useEffect(() => {
    insideRefsRef.current = insideRefs
  }, [insideRefs])

  const registerLayer = useCallback(
    (node: HTMLElement): void => {
      layerNodesRef.current.add(node)
      parentLayer?.register(node)
    },
    [parentLayer],
  )

  const unregisterLayer = useCallback(
    (node: HTMLElement): void => {
      layerNodesRef.current.delete(node)
      parentLayer?.unregister(node)
    },
    [parentLayer],
  )

  const layerContextValue = useMemo(
    () => ({ register: registerLayer, unregister: unregisterLayer }),
    [registerLayer, unregisterLayer],
  )

  // 自身挂载后注册到父级浮层集合，避免被父级误判为外部。
  useEffect(() => {
    if (!parentLayer || !active || !rootRef.current) return
    const node = rootRef.current
    parentLayer.register(node)
    return () => parentLayer.unregister(node)
  }, [parentLayer, active, rootRef])

  const isInside = useCallback(
    (target: Node): boolean => {
      if (rootRef.current?.contains(target)) return true
      for (const ref of insideRefsRef.current ?? []) {
        if (ref.current?.contains(target)) return true
      }
      for (const node of layerNodesRef.current) {
        if (node.contains(target)) return true
      }
      return false
    },
    [rootRef],
  )

  // 外部关闭使用 pointerdown：pointerdown 被 preventDefault 后浏览器不再派发兼容 mousedown，
  // 终端 / CodeMirror 等场景下 mousedown 监听会漏关。
  useEffect(() => {
    if (!isOpen || !closeOnOutsideClick) return
    const handleOutsidePointerDown = (event: PointerEvent): void => {
      if (!isInside(event.target as Node)) onClose()
    }
    document.addEventListener("pointerdown", handleOutsidePointerDown)
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown)
  }, [isOpen, closeOnOutsideClick, isInside, onClose])

  // Esc 关闭。
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, onClose])

  // 滚动关闭：页面级滚动、或滚动容器包含锚点时关闭；无关容器滚动不影响浮层。
  useEffect(() => {
    if (!isOpen || !closeOnScroll) return
    const handleScroll = (event: Event): void => {
      const target = event.target as Node
      if (isInside(target)) return
      if (target === document || target === document.documentElement) {
        onClose()
        return
      }
      const anchor = anchorRef?.current
      if (!anchor || (target instanceof Element && target.contains(anchor))) onClose()
    }
    document.addEventListener("scroll", handleScroll, true)
    return () => document.removeEventListener("scroll", handleScroll, true)
  }, [isOpen, closeOnScroll, isInside, anchorRef, onClose])

  return { layerContextValue }
}

// useLayerPresence 返回值。
export interface UseLayerPresenceResult {
  // 浮层节点是否需要渲染（退场动画期间仍为 true）。
  shouldRender: boolean
  // 是否正在播放退场动画。
  isAnimatingOut: boolean
}

/**
 * 浮层挂载 / 退场状态机：打开时挂载，关闭后延迟 LAYER_EXIT_DURATION 卸载并回调 onExited。
 */
export const useLayerPresence = (
  isOpen: boolean,
  onExited?: () => void,
): UseLayerPresenceResult => {
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const onExitedRef = useRef(onExited)

  useEffect(() => {
    onExitedRef.current = onExited
  }, [onExited])

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      setIsAnimatingOut(false)
      return
    }
    if (!shouldRender) return

    setIsAnimatingOut(true)
    const timer = setTimeout(() => {
      setShouldRender(false)
      setIsAnimatingOut(false)
      onExitedRef.current?.()
    }, LAYER_EXIT_DURATION)
    return () => clearTimeout(timer)
  }, [isOpen, shouldRender])

  return { shouldRender, isAnimatingOut }
}
