import { ChevronLeft, ChevronRight, FileText, Image as ImageIcon } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"

export interface AgentInputFile {
  id: string
  name: string
  path: string
  type: "image" | "text"
  size?: string
  extension?: string
}

interface AgentInputFilesProps {
  files: AgentInputFile[]
  onRemove: (id: string) => void
}

export const AgentInputFiles = ({
  files,
  onRemove,
}: AgentInputFilesProps): React.JSX.Element | null => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollLeft(scrollLeft > 1)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    updateScrollState()

    const onScroll = (): void => updateScrollState()
    const onWheel = (event: WheelEvent): void => {
      if (!event.deltaY) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    el.addEventListener("wheel", onWheel, { passive: false })

    const observer = new ResizeObserver(() => updateScrollState())
    observer.observe(el)

    return () => {
      el.removeEventListener("scroll", onScroll)
      el.removeEventListener("wheel", onWheel)
      observer.disconnect()
    }
  }, [files, updateScrollState])

  const handleScroll = useCallback((direction: "left" | "right"): void => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direction === "left" ? -200 : 200, behavior: "smooth" })
  }, [])

  if (files.length === 0) return null

  return (
    <div className="mb-2 flex items-center gap-1.5 border-b border-white/5 pb-2">
      <LxIconButton
        aria-label="向左滚动"
        disabled={!canScrollLeft}
        size="small"
        onClick={() => handleScroll("left")}
      >
        <ChevronLeft className="h-3 w-3" />
      </LxIconButton>

      <div
        ref={scrollRef}
        className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
      >
        {files.map((file) => {
          const isImage = file.type === "image"
          const prefixIcon = isImage ? (
            <ImageIcon className="h-3.5 w-3.5 text-blue-400" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-teal-400" />
          )

          const imageSrc = isImage ? `lx-image://local${file.path}` : ""
          const tooltipContent = isImage ? (
            <div className="p-1 max-w-[320px] max-h-[320px] flex items-center justify-center overflow-hidden">
              <img
                src={imageSrc}
                alt={file.name}
                className="max-w-full max-h-full object-contain rounded-[4px]"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 text-xs text-left max-w-[280px]">
              <span className="font-semibold text-white/95 truncate">{file.name}</span>
              <span className="text-[10px] text-white/40 break-all">{file.path}</span>
            </div>
          )

          return (
            <LxTooltip key={file.id} content={tooltipContent} placement="top" multiline>
              <div className="flex shrink-0 items-center">
                <LxTag
                  size="default"
                  color={isImage ? "blue" : "teal"}
                  prefix={prefixIcon}
                  onClose={() => onRemove(file.id)}
                  confirmClose={false}
                  closeTooltipContent="移除此文件"
                >
                  {file.name}
                </LxTag>
              </div>
            </LxTooltip>
          )
        })}
      </div>

      <LxIconButton
        aria-label="向右滚动"
        disabled={!canScrollRight}
        size="small"
        onClick={() => handleScroll("right")}
      >
        <ChevronRight className="h-3 w-3" />
      </LxIconButton>
    </div>
  )
}
