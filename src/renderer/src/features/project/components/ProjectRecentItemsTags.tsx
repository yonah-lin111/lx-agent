import { Boxes, ChevronLeft, ChevronRight, File, Folder, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { TreeBranchIcon } from "@/components/ui/TreeBranchIcon"
import {
  type RecentItemCard,
  resolveRecentItemCards,
  useRecentItemsStore,
} from "@/features/project/recentItemsStore"
import { useProjectItemsVersionStore } from "@/features/project-navigation/projectItemsStore"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

// 拼接「项目/文件夹/条目」单行标签文本。
const formatTagLabel = (card: RecentItemCard): string =>
  [card.projectName, card.folderName, card.itemName].filter(Boolean).join("/")

// 渲染 tag 悬停详情中的模版状态数量徽章。
const renderStatusBadges = (card: RecentItemCard): React.ReactNode => {
  if (card.todo <= 0 && card.inProgress <= 0 && card.done <= 0) return null
  return (
    <div className="flex items-center gap-1.5">
      {card.todo > 0 && (
        <span
          aria-label={`待办 ${card.todo}`}
          className="flex items-center gap-1 rounded-[4px] bg-white/5 px-1 text-[10px] leading-4 text-white/50"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
          {card.todo}
        </span>
      )}
      {card.inProgress > 0 && (
        <span
          aria-label={`进行中 ${card.inProgress}`}
          className="flex items-center gap-1 rounded-[4px] bg-amber-400/10 px-1 text-[10px] leading-4 text-amber-400"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          {card.inProgress}
        </span>
      )}
      {card.done > 0 && (
        <span
          aria-label={`已完成 ${card.done}`}
          className="flex items-center gap-1 rounded-[4px] bg-emerald-400/10 px-1 text-[10px] leading-4 text-emerald-400"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {card.done}
        </span>
      )}
    </div>
  )
}

// 渲染 tag 悬停详情：项目/文件夹/条目树与状态数量，带直角分支缩进与 icon 颜色。
const renderCardDetails = (card: RecentItemCard): React.ReactNode => (
  <div className="flex flex-col gap-1">
    {card.projectName && (
      <div className="flex items-center gap-1 pl-1">
        <Boxes className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
        <span className="min-w-0 truncate text-xs font-normal text-white/70">
          {card.projectName}
        </span>
      </div>
    )}
    {card.folderName && (
      <div className="flex items-center gap-1 pl-1">
        <TreeBranchIcon />
        <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
        <span className="min-w-0 truncate text-xs font-normal text-white/70">
          {card.folderName}
        </span>
      </div>
    )}
    <div className={`flex items-center gap-1 ${card.folderName ? "pl-3" : "pl-1"}`}>
      <TreeBranchIcon />
      <File className="h-3.5 w-3.5 shrink-0 text-white/50" />
      <span className="min-w-0 truncate text-xs font-semibold text-white/90">{card.itemName}</span>
    </div>
    {renderStatusBadges(card)}
  </div>
)

/**
 * 项目头部面包屑行内的最近打开 tag 栏：与展开区最近卡片共用同一份数据，
 * 支持点击跳转、拖拽重排、移除与左右/滚轮滚动；无记录时显示占位文本。
 */
export const ProjectRecentItemsTags = (): React.JSX.Element => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get("itemId")
  const recentIds = useRecentItemsStore((state) => state.ids)
  const removeRecent = useRecentItemsStore((state) => state.remove)
  const moveRecent = useRecentItemsStore((state) => state.move)
  const version = useProjectItemsVersionStore((state) => state.version)
  const [cards, setCards] = useState<RecentItemCard[] | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // 最近打开条目或条目数据变更（状态/模版编辑）时重新解析卡片数据。
  useEffect(() => {
    let isCurrent = true
    void resolveRecentItemCards(recentIds).then(({ cards: nextCards }) => {
      if (!isCurrent) return
      setCards(nextCards)
    })
    return () => {
      isCurrent = false
    }
  }, [recentIds, version])

  // 更新可滚动方向状态。
  const updateScrollState = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollLeft(scrollLeft > 1)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1)
  }, [])

  // 滚轮转水平滚动 + 可滚动方向状态。
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
  }, [cards, updateScrollState])

  const handleScroll = useCallback((direction: "left" | "right"): void => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direction === "left" ? -200 : 200, behavior: "smooth" })
  }, [])

  // 拖拽结束后将条目移动到目标 tag 位置并持久化。
  const handleDropOnTag = useCallback(
    (targetItemId: string): void => {
      const fromId = draggingIdRef.current
      if (fromId === null || fromId === targetItemId) return
      moveRecent(fromId, targetItemId)
      setCards((current) => {
        if (!current) return current
        const from = current.findIndex((card) => card.id === fromId)
        const to = current.findIndex((card) => card.id === targetItemId)
        if (from === -1 || to === -1 || from === to) return current
        const next = [...current]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      })
      draggingIdRef.current = null
      setDraggingId(null)
    },
    [moveRecent],
  )

  // 移除最近打开条目并同步清理本地卡片。
  const removeRecentTag = useCallback(
    (targetItemId: string): void => {
      removeRecent(targetItemId)
      setCards((current) =>
        current ? current.filter((card) => card.id !== targetItemId) : current,
      )
    },
    [removeRecent],
  )

  // 拖拽结束（含取消）时清理拖动状态。
  const handleDragEnd = useCallback((): void => {
    draggingIdRef.current = null
    setDraggingId(null)
  }, [])

  return (
    <div className="flex h-6 min-w-0 flex-1 items-center gap-1">
      <LxIconButton
        aria-label="向左滚动"
        disabled={!canScrollLeft}
        size="small"
        onClick={() => handleScroll("left")}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </LxIconButton>
      <div
        ref={scrollRef}
        className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {cards === null ? null : cards.length === 0 ? (
          <span className="whitespace-nowrap text-white/40">暂无最近打开</span>
        ) : (
          cards.map((card) => {
            const isActive = card.id === itemId
            const isDragging = draggingId === card.id
            return (
              <LxTooltip key={card.id} content={renderCardDetails(card)} multiline placement="top">
                <div
                  draggable
                  onDragStart={(event) => {
                    draggingIdRef.current = card.id
                    setDraggingId(card.id)
                    event.dataTransfer.effectAllowed = "move"
                    event.dataTransfer.setData("text/plain", card.id)
                  }}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => {
                    if (draggingIdRef.current !== null && draggingIdRef.current !== card.id) {
                      event.preventDefault()
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    handleDropOnTag(card.id)
                  }}
                  className={`flex shrink-0 cursor-grab items-center ${isDragging ? "opacity-40" : ""}`}
                >
                  <LxTag
                    size="small"
                    highlighted={isActive}
                    onClick={() => navigate(`${PAGE_ROUTES.project}?itemId=${card.id}`)}
                    suffix={
                      <span
                        aria-label="移出最近打开"
                        className="flex cursor-pointer items-center justify-center text-current opacity-60 transition-all hover:text-rose-400 hover:opacity-100"
                        role="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          removeRecentTag(card.id)
                        }}
                      >
                        <X className="h-2.5 w-2.5" />
                      </span>
                    }
                  >
                    {formatTagLabel(card)}
                  </LxTag>
                </div>
              </LxTooltip>
            )
          })
        )}
      </div>
      <LxIconButton
        aria-label="向右滚动"
        disabled={!canScrollRight}
        size="small"
        onClick={() => handleScroll("right")}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </LxIconButton>
    </div>
  )
}
