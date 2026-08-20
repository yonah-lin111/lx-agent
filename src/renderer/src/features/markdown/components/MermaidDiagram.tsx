import {
  ChevronDown,
  ChevronUp,
  Lock,
  Maximize2,
  RotateCcw,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import mermaid from "mermaid"
import { useEffect, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"

// Mermaid 视图变换状态。
interface MermaidTransform {
  x: number
  y: number
  scale: number
}

// Mermaid 图表属性。
interface MermaidDiagramProps {
  source: string
}

const MIN_SCALE = 0.5
const MAX_SCALE = 2.5
const SCALE_STEP = 0.15
const INITIAL_TRANSFORM: MermaidTransform = { x: 0, y: 0, scale: 1 }

let diagramSequence = 0
let isMermaidInitialized = false
let mermaidRenderQueue = Promise.resolve()

/**
 * 初始化 Mermaid 的黑色主题，避免每张图重复设置全局配置。
 */
const initializeMermaid = (): void => {
  if (isMermaidInitialized) return

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      background: "#171717",
      primaryColor: "#292929",
      primaryBorderColor: "#737373",
      primaryTextColor: "#f5f5f5",
      secondaryColor: "#212121",
      tertiaryColor: "#171717",
      lineColor: "#a3a3a3",
      textColor: "#f5f5f5",
      mainBkg: "#292929",
      nodeBorder: "#737373",
      clusterBkg: "#1c1c1c",
      clusterBorder: "#525252",
      actorBkg: "#292929",
      actorBorder: "#737373",
      actorTextColor: "#f5f5f5",
      signalColor: "#d4d4d4",
      signalTextColor: "#f5f5f5",
      labelBoxBkgColor: "#292929",
      labelBoxBorderColor: "#737373",
      labelTextColor: "#f5f5f5",
    },
    flowchart: { htmlLabels: false, curve: "basis" },
  })
  isMermaidInitialized = true
}

/**
 * Mermaid 使用共享渲染状态，多个图表必须按顺序渲染以避免重新挂载时互相覆盖。
 */
const renderMermaid = (id: string, source: string) => {
  const renderTask = mermaidRenderQueue.then(() => mermaid.render(id, source))
  mermaidRenderQueue = renderTask.then(
    () => undefined,
    () => undefined,
  )
  return renderTask
}

/**
 * 将 Mermaid 源码渲染为可平移缩放的 SVG 图表。
 */
export const MermaidDiagram = ({ source }: MermaidDiagramProps): React.JSX.Element => {
  const diagramIdRef = useRef(`mermaid-diagram-${diagramSequence++}`)
  const renderTargetRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pointerIdRef = useRef<number | null>(null)
  const pointerPositionRef = useRef({ x: 0, y: 0 })
  const [transform, setTransform] = useState<MermaidTransform>(INITIAL_TRANSFORM)
  const [isLocked, setIsLocked] = useState(true)
  const [isExpanded, setIsExpanded] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation()

  useEffect(() => {
    const target = renderTargetRef.current
    if (!target) return

    let isCurrent = true
    initializeMermaid()
    setError(null)
    target.replaceChildren()

    void renderMermaid(diagramIdRef.current, source)
      .then(({ svg, bindFunctions }) => {
        if (!isCurrent) return
        target.innerHTML = svg
        bindFunctions?.(target)
      })
      .catch(() => {
        if (isCurrent) setError(t("markdown.diagramSyntaxError"))
      })

    return () => {
      isCurrent = false
    }
  }, [source, t])

  const changeScale = (offset: number): void => {
    if (isLocked) return

    setTransform((current) => ({
      ...current,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale + offset)),
    }))
  }

  const resetTransform = (): void => {
    if (!isLocked) setTransform(INITIAL_TRANSFORM)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (isLocked) return

    pointerIdRef.current = event.pointerId
    pointerPositionRef.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (pointerIdRef.current !== event.pointerId) return

    const offsetX = event.clientX - pointerPositionRef.current.x
    const offsetY = event.clientY - pointerPositionRef.current.y
    pointerPositionRef.current = { x: event.clientX, y: event.clientY }
    setTransform((current) => ({ ...current, x: current.x + offsetX, y: current.y + offsetY }))
  }

  const releasePointer = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (pointerIdRef.current !== event.pointerId) return

    pointerIdRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const toggleContent = (): void => {
    const section = sectionRef.current
    const content = contentRef.current
    if (!section || !content) return

    const nextIsExpanded = !isExpanded
    content.style.height = `${content.scrollHeight}px`
    section.classList.toggle("is-collapsed", !nextIsExpanded)

    requestAnimationFrame(() => {
      content.style.height = nextIsExpanded ? `${content.scrollHeight}px` : "0px"
    })

    if (nextIsExpanded) {
      content.addEventListener(
        "transitionend",
        () => {
          if (!section.classList.contains("is-collapsed")) content.style.height = ""
        },
        { once: true },
      )
    }

    setIsExpanded(nextIsExpanded)
  }

  return (
    <section
      ref={sectionRef}
      className="my-4 overflow-hidden rounded-[6px] border border-white/10 bg-[#171717]"
    >
      <div className="flex h-10 items-center justify-between border-b border-white/10 bg-[#212121] px-2">
        <span className="text-[12px] text-white/50">Mermaid</span>
        <div className="flex items-center gap-0.5" aria-label={t("markdown.viewControl")}>
          <LxIconButton
            aria-label={t("common.zoomOut")}
            disabled={isLocked || transform.scale <= MIN_SCALE}
            size="small"
            title={{ content: t("common.zoomOut"), placement: "bottom" }}
            onClick={() => changeScale(-SCALE_STEP)}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </LxIconButton>
          <LxIconButton
            aria-label={t("common.zoomIn")}
            disabled={isLocked || transform.scale >= MAX_SCALE}
            size="small"
            title={{ content: t("common.zoomIn"), placement: "bottom" }}
            onClick={() => changeScale(SCALE_STEP)}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </LxIconButton>
          <LxIconButton
            aria-label={t("common.resetView")}
            disabled={isLocked}
            size="small"
            title={{ content: t("common.resetView"), placement: "bottom" }}
            onClick={resetTransform}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </LxIconButton>
          <LxIconButton
            aria-label={isLocked ? t("common.unlock") : t("common.lock")}
            highlighted={!isLocked}
            size="small"
            title={{ content: isLocked ? t("common.unlock") : t("common.lock"), placement: "bottom" }}
            onClick={() => setIsLocked((current) => !current)}
          >
            {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </LxIconButton>
          <LxIconButton
            aria-label={isExpanded ? t("markdown.collapseContent") : t("markdown.expandContent")}
            aria-expanded={isExpanded}
            size="small"
            title={{ content: isExpanded ? t("markdown.collapseContent") : t("markdown.expandContent"), placement: "bottom" }}
            onClick={toggleContent}
          >
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </LxIconButton>
        </div>
      </div>
      <div ref={contentRef} className="markdown-mermaid-content">
        <div
          aria-label={isLocked ? t("markdown.lockedDiagram") : t("markdown.interactiveDiagram")}
          className={`relative flex min-h-56 items-center justify-center overflow-hidden ${
            isLocked ? "cursor-default" : "cursor-grab touch-none active:cursor-grabbing"
          }`}
          role="region"
          onPointerCancel={releasePointer}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={releasePointer}
        >
          <div
            ref={renderTargetRef}
            className="flex max-w-none items-center justify-center p-8 transition-transform duration-150 motion-reduce:transition-none [&_svg]:max-w-none"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            }}
          />
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#171717] px-4 text-center text-[13px] text-rose-300">
              {error}
            </div>
          )}
          <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-[4px] bg-black/55 px-2 py-1 text-[11px] text-white/45">
            <Maximize2 className="h-3 w-3" />
            <span>{Math.round(transform.scale * 100)}%</span>
          </div>
        </div>
      </div>
    </section>
  )
}
