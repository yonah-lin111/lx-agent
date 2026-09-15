import type React from "react"
import type { CSSProperties, ReactNode, Ref } from "react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

// 命令面板公共数据：定位坐标与键盘激活项。
export interface LxCommandPanelData {
  position: CSSProperties
  activeIndex: number
}

export interface LxCommandPanelProps<T extends LxCommandPanelData> {
  // 数据就绪且应显示。
  visible: boolean
  // 面板数据；关闭期间由壳冻结最后一份快照用于退场动画。
  data: T | null
  ariaLabel: string
  className: string
  // options 容器上的 aria-activedescendant 指向（随冻结数据解析）。
  ariaActiveDescendant?: (data: T) => string | undefined
  // 激活项滚动定位；默认关闭，保持无滚动面板的既有行为。
  scrollActiveItem?: boolean
  // 退场动画播放完成后的回调，用于父级延迟卸载。
  onExited?: () => void
  // 面板根节点引用，供外部点击判定等使用。
  panelRef?: Ref<HTMLDivElement>
  children: (data: T) => ReactNode
}

// 透传 HTML 属性时保留行内固定语义。
export interface LxCommandPanelItemProps
  extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "children" | "className" | "id" | "onMouseDown" | "onSelect" | "role"
  > {
  index: number
  active: boolean
  onSelect?: () => void
  id?: string
  // 布局类由调用方提供，避免与状态色类冲突。
  className?: string
  activeClassName?: string
  idleClassName?: string
  // 左侧图标槽。
  leading?: ReactNode
  children: ReactNode
}

/**
 * 面板退场动画：关闭后保留最后数据渲染 120ms 播放退场动画。
 */
const useCommandPanelAnimation = <T,>(
  visible: boolean,
  data: T | null,
): { displayData: T; isAnimatingOut: boolean } | null => {
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  const lastDataRef = useRef<T | null>(null)
  if (visible && data) lastDataRef.current = data

  useEffect(() => {
    if (visible) {
      setShouldRender(true)
      setIsAnimatingOut(false)
      return
    }
    if (!shouldRender) return

    setIsAnimatingOut(true)
    const timer = setTimeout(() => {
      setShouldRender(false)
      setIsAnimatingOut(false)
    }, 120)
    return () => clearTimeout(timer)
  }, [visible, shouldRender])

  if (!shouldRender) return null
  const displayData = (visible && data ? data : lastDataRef.current) as T | null
  if (!displayData) return null
  return { displayData, isAnimatingOut }
}

/**
 * 将激活项滚动到容器可视区域内，与边缘保持间距。
 */
export const scrollActiveItemIntoView = (container: HTMLElement, activeIndex: number): void => {
  const activeElement = container.querySelector(
    `[data-index="${activeIndex}"]`,
  ) as HTMLElement | null
  if (!activeElement) return

  const scrollPadding = 4
  const containerRect = container.getBoundingClientRect()
  const activeRect = activeElement.getBoundingClientRect()

  if (activeRect.top < containerRect.top + scrollPadding) {
    container.scrollTop -= containerRect.top + scrollPadding - activeRect.top
  } else if (activeRect.bottom > containerRect.bottom - scrollPadding) {
    container.scrollTop += activeRect.bottom - (containerRect.bottom - scrollPadding)
  }
}

/**
 * 激活项随键盘移动时保持可见。
 */
const useActiveItemScrollIntoView = (
  isOpen: boolean,
  position: CSSProperties | null,
  activeIndex: number,
): React.RefObject<HTMLDivElement | null> => {
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!isOpen || !position) return
    const container = panelRef.current
    if (!container) return
    scrollActiveItemIntoView(container, activeIndex)
  }, [isOpen, position, activeIndex])

  return panelRef
}

/**
 * 渲染紧贴触发点的命令面板壳：统一退场动画、定位、滚动定位与 listbox 语义。
 */
export const LxCommandPanel = <T extends LxCommandPanelData>({
  visible,
  data,
  ariaLabel,
  className,
  ariaActiveDescendant,
  scrollActiveItem = false,
  onExited,
  panelRef,
  children,
}: LxCommandPanelProps<T>): React.JSX.Element | null => {
  const animated = useCommandPanelAnimation(visible && data !== null, data)
  const scrollRef = useActiveItemScrollIntoView(
    visible && scrollActiveItem,
    animated?.displayData.position ?? null,
    animated?.displayData.activeIndex ?? 0,
  )

  const setPanelNode = useCallback(
    (node: HTMLDivElement | null): void => {
      scrollRef.current = node
      if (typeof panelRef === "function") {
        panelRef(node)
      } else if (panelRef) {
        panelRef.current = node
      }
    },
    [panelRef, scrollRef],
  )

  const shouldRender = animated !== null
  const wasRenderedRef = useRef(false)
  useEffect(() => {
    if (!shouldRender && wasRenderedRef.current) onExited?.()
    wasRenderedRef.current = shouldRender
  }, [shouldRender, onExited])

  if (!animated) return null

  return (
    <div
      ref={setPanelNode}
      aria-label={ariaLabel}
      aria-activedescendant={ariaActiveDescendant?.(animated.displayData)}
      className={`${className} ${
        animated.isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={animated.displayData.position}
    >
      {children(animated.displayData)}
    </div>
  )
}

/**
 * 渲染命令面板选项行：统一 aria、鼠标选择与高亮状态。
 */
export const LxCommandPanelItem = ({
  index,
  active,
  onSelect,
  id,
  className = "",
  activeClassName = "bg-white/8 text-white",
  idleClassName = "text-white/75 hover:bg-white/5",
  leading,
  children,
  ...restProps
}: LxCommandPanelItemProps): React.JSX.Element => (
  <div
    {...restProps}
    id={id}
    role="option"
    data-index={index}
    aria-selected={active}
    className={`w-full cursor-pointer rounded-[4px] text-left transition-colors ${
      active ? activeClassName : idleClassName
    } ${className}`}
    onMouseDown={(event) => {
      event.preventDefault()
      onSelect?.()
    }}
  >
    {leading}
    {children}
  </div>
)
