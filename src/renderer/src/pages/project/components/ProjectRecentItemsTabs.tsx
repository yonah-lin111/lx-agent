import type { ProjectItemStatus } from "@shared/project"
import { Boxes, BrushCleaning, ChevronLeft, ChevronRight, File, Folder, X } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { projectApi } from "@/features/project/api/projectApi"
import { countTemplateBlocks, pushRecentItemId } from "@/features/project/utils"
import { useProjectItemsVersionStore } from "@/features/project-navigation/projectItemsStore"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

// localStorage 中保存最近打开条目 id 列表的键。
const RECENT_ITEMS_KEY = "project-navigation-recent-items"

// loading 最短展示时长，避免 IPC 过快时闪烁。
const MIN_LOADING_DURATION = 300
// loading 淡出时长。
const FADE_OUT_DURATION = 300
// 删除补位过渡时长。
const FLIP_DURATION = 200

// 最近条目卡片数据。
interface RecentItemCard {
  id: string
  itemName: string
  projectName: string
  folderName: string | null
  status: ProjectItemStatus
  todo: number
  inProgress: number
  done: number
}

// 条目状态对应的卡片背景样式（带透明度的状态色）。
const ITEM_STATUS_CARD_STYLES: Record<
  ProjectItemStatus,
  { idle: string; active: string; hover: string }
> = {
  todo: {
    idle: "border-white/5 bg-white/[0.03]",
    active: "border-white/15 bg-white/10",
    hover: "hover:border-white/10 hover:bg-white/[0.06]",
  },
  in_progress: {
    idle: "border-amber-400/15 bg-amber-400/[0.07]",
    active: "border-amber-400/25 bg-amber-400/[0.12]",
    hover: "hover:border-amber-400/25 hover:bg-amber-400/[0.12]",
  },
  completed: {
    idle: "border-emerald-400/15 bg-emerald-400/[0.07]",
    active: "border-emerald-400/25 bg-emerald-400/[0.12]",
    hover: "hover:border-emerald-400/25 hover:bg-emerald-400/[0.12]",
  },
}

// 读取最近打开的条目 id 列表。
const readRecentItemIds = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_ITEMS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

// 写入最近打开的条目 id 列表。
const writeRecentItemIds = (ids: string[]): void => {
  try {
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(ids))
  } catch {
    // 忽略可能存在的 Storage 写入异常。
  }
}

// 最近条目标签栏属性。
interface ProjectRecentItemsTabsProps {
  isExpanded: boolean
}

/**
 * 项目页面头部最近条目标签栏：按用户拖拽固定的顺序展示条目卡片，
 * 打开新条目不调整已有顺序，支持左右滚动与拖拽重排。
 * 组件在项目页内常驻，折叠时仅停止渲染列表、仍保持打开记录。
 */
export const ProjectRecentItemsTabs = ({
  isExpanded,
}: ProjectRecentItemsTabsProps): React.JSX.Element | null => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get("itemId")
  const [recentIds, setRecentIds] = useState<string[]>(readRecentItemIds)
  const [cards, setCards] = useState<RecentItemCard[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const hasLoadedRef = useRef(false)
  const loadingEndTimerRef = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map())
  // 拖拽重排造成的顺序变化不触发补位动画。
  const isDragReorderRef = useRef(false)
  const draggingIdRef = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const version = useProjectItemsVersionStore((state) => state.version)

  // 打开条目时按 LRU 记录到 localStorage；折叠态下保持记录。
  useEffect(() => {
    if (!itemId) return
    setRecentIds((current) => {
      const next = pushRecentItemId(current, itemId)
      const isSame =
        next.length === current.length && next.every((id, index) => id === current[index])
      if (isSame) return current
      writeRecentItemIds(next)
      return next
    })
  }, [itemId])

  // 展开时加载最近条目；展开期间条目版本变化或打开新条目时静默刷新。
  useEffect(() => {
    if (!isExpanded) return
    let isCurrent = true
    if (loadingEndTimerRef.current !== null) {
      window.clearTimeout(loadingEndTimerRef.current)
      loadingEndTimerRef.current = null
    }
    setIsFadingOut(false)

    const isFirstLoad = !hasLoadedRef.current
    if (isFirstLoad) setIsLoading(true)
    const startedAt = Date.now()

    void projectApi
      .listProjects()
      .then(async (projects) => {
        const [folders, items] = await Promise.all([projectApi.listFolders(), projectApi.list()])
        if (!isCurrent) return
        const projectById = new Map(projects.map((project) => [project.id, project]))
        const folderById = new Map(folders.map((folder) => [folder.id, folder]))
        const itemById = new Map(items.map((item) => [item.id, item]))
        const validIds: string[] = []
        const nextCards: RecentItemCard[] = []
        for (const id of recentIds) {
          const item = itemById.get(id)
          if (!item) continue
          validIds.push(id)
          const counts = countTemplateBlocks(item.itemData)
          const folder = item.projectFolderId ? folderById.get(item.projectFolderId) : undefined
          nextCards.push({
            id: item.id,
            itemName: item.name,
            projectName: projectById.get(item.projectId)?.name ?? "",
            folderName: folder?.name ?? null,
            status: item.status,
            todo: counts.todo,
            inProgress: counts.inProgress,
            done: counts.done,
          })
        }
        // 顺手清理已被删除的失效 id。
        if (validIds.length !== recentIds.length) writeRecentItemIds(validIds)
        hasLoadedRef.current = true
        setCards(nextCards)
      })
      .catch((error) => {
        if (isCurrent) console.error("Failed to load recent items", error)
      })
      .finally(() => {
        if (!isCurrent) return
        if (!isFirstLoad) {
          setIsLoading(false)
          setIsFadingOut(false)
          return
        }
        const finishLoading = (): void => {
          setIsFadingOut(true)
          loadingEndTimerRef.current = window.setTimeout(() => {
            loadingEndTimerRef.current = null
            if (isCurrent) {
              setIsLoading(false)
              setIsFadingOut(false)
            }
          }, FADE_OUT_DURATION)
        }
        const remainingDuration = Math.max(0, MIN_LOADING_DURATION - (Date.now() - startedAt))
        if (remainingDuration > 0) {
          loadingEndTimerRef.current = window.setTimeout(finishLoading, remainingDuration)
        } else {
          finishLoading()
        }
      })

    return () => {
      isCurrent = false
    }
  }, [isExpanded, recentIds, version])

  // 卡片因删除而非尾部条目产生位移时执行 FLIP 补位动画；
  // 拖拽重排（isDragReorderRef）不触发，新卡片靠 animate-push-in 推入。
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || !isExpanded || cards === null) return
    const prev = prevRectsRef.current
    const next = new Map<string, DOMRect>()
    const moved: HTMLElement[] = []
    for (const cardEl of Array.from(el.querySelectorAll<HTMLElement>("[data-recent-item-id]"))) {
      const id = cardEl.dataset.recentItemId ?? ""
      const rect = cardEl.getBoundingClientRect()
      next.set(id, rect)
      const prevRect = prev.get(id)
      if (!prevRect) continue
      const dx = prevRect.left - rect.left
      if (Math.abs(dx) > 1) {
        cardEl.style.transition = "none"
        cardEl.style.transform = `translateX(${dx}px)`
        moved.push(cardEl)
      }
    }
    prevRectsRef.current = next
    if (moved.length === 0) return
    const reset = (): void => {
      for (const cardEl of moved) {
        cardEl.style.transition = ""
        cardEl.style.transform = ""
      }
    }
    if (isDragReorderRef.current) {
      isDragReorderRef.current = false
      reset()
      return
    }
    const frame = requestAnimationFrame(() => {
      for (const cardEl of moved) {
        cardEl.style.transition = `transform ${FLIP_DURATION}ms ease-out`
        cardEl.style.transform = ""
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [cards, isExpanded])

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
  }, [cards, isExpanded, updateScrollState])

  const handleScroll = useCallback((direction: "left" | "right"): void => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direction === "left" ? -200 : 200, behavior: "smooth" })
  }, [])

  const handleCardClick = useCallback(
    (targetItemId: string): void => {
      navigate(`${PAGE_ROUTES.project}?itemId=${targetItemId}`)
    },
    [navigate],
  )

  // 从最近打开列表移除条目并同步清理卡片。
  const removeRecentItem = useCallback((targetItemId: string): void => {
    setRecentIds((current) => {
      const next = current.filter((id) => id !== targetItemId)
      writeRecentItemIds(next)
      return next
    })
    setCards((current) => (current ? current.filter((card) => card.id !== targetItemId) : current))
  }, [])

  // 拖拽结束后将条目移动到目标卡片位置并持久化。
  const handleDropOnCard = useCallback((targetItemId: string): void => {
    const fromId = draggingIdRef.current
    if (fromId === null || fromId === targetItemId) return
    setRecentIds((current) => {
      const from = current.indexOf(fromId)
      const to = current.indexOf(targetItemId)
      if (from === -1 || to === -1 || from === to) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      writeRecentItemIds(next)
      isDragReorderRef.current = true
      return next
    })
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
  }, [])

  // 拖拽结束（含取消）时清理拖动状态。
  const handleDragEnd = useCallback((): void => {
    draggingIdRef.current = null
    setDraggingId(null)
  }, [])

  // 清空最近打开记录。
  const clearRecentItems = useCallback((): void => {
    setRecentIds([])
    writeRecentItemIds([])
    setCards([])
  }, [])

  if (!isExpanded) return null

  return (
    <div className="flex h-full w-full flex-col gap-1 pt-1">
      <div className="flex shrink-0 items-center justify-between pl-1">
        <span className="text-xs tracking-wide text-white/40">最近打开</span>
        <LxIconButton
          aria-label="清除最近打开记录"
          disabled={recentIds.length === 0}
          size="small"
          title={{
            content: "清除后无法恢复，确定清除所有最近打开记录吗？",
            placement: "top",
            title: "清除最近记录",
            onConfirm: clearRecentItems,
          }}
        >
          <BrushCleaning className="h-3.5 w-3.5" />
        </LxIconButton>
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <LxIconButton
          aria-label="向左滚动"
          disabled={!canScrollLeft}
          size="medium"
          onClick={() => handleScroll("left")}
        >
          <ChevronLeft className="h-4 w-4" />
        </LxIconButton>
        <div
          ref={scrollRef}
          className="scrollbar-hidden flex min-w-0 flex-1 items-center overflow-x-auto py-2"
        >
          {isLoading ? (
            <div
              className={`flex min-w-0 items-stretch gap-1.5 transition-opacity duration-300 ease-out ${
                isFadingOut ? "opacity-0" : "opacity-100"
              }`}
            >
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="flex w-[200px] shrink-0 animate-pulse flex-col gap-1.5 rounded-[6px] border border-white/5 bg-white/[0.03] p-2"
                >
                  <div className="flex items-center gap-1.5">
                    <div className="h-3.5 w-3.5 shrink-0 rounded-[4px] bg-white/10" />
                    <div className="h-3 min-w-0 flex-1 rounded-[4px] bg-white/10" />
                  </div>
                  <div className="h-2.5 w-2/3 rounded-[4px] bg-white/[0.06]" />
                </div>
              ))}
            </div>
          ) : cards !== null && cards.length === 0 ? (
            <div className="w-full py-2 text-center text-xs text-white/40">暂无最近条目</div>
          ) : (
            <div className="flex min-w-0 items-stretch gap-1.5">
              {cards?.map((card) => {
                const isActive = card.id === itemId
                const isDragging = draggingId === card.id
                return (
                  <div
                    key={card.id}
                    data-recent-item-id={card.id}
                    role="button"
                    tabIndex={0}
                    aria-current={isActive ? "page" : undefined}
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
                      handleDropOnCard(card.id)
                    }}
                    className={`group relative flex w-[200px] shrink-0 animate-push-in cursor-pointer flex-col gap-1 rounded-[6px] border p-2 text-left transition-colors duration-150 ${
                      isActive
                        ? ITEM_STATUS_CARD_STYLES[card.status].active
                        : `${ITEM_STATUS_CARD_STYLES[card.status].idle} ${ITEM_STATUS_CARD_STYLES[card.status].hover}`
                    } ${isDragging ? "opacity-40" : ""}`}
                    onClick={() => handleCardClick(card.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        handleCardClick(card.id)
                      }
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <File
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isActive ? "text-white/70" : "text-white/30"
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/80">
                        {card.itemName}
                      </span>
                      {(card.todo > 0 || card.inProgress > 0 || card.done > 0) && (
                        <span className="flex shrink-0 items-center gap-1">
                          {card.todo > 0 && (
                            <LxTooltip content={`待办 ${card.todo}`} placement="top">
                              <span
                                aria-label={`待办 ${card.todo}`}
                                className="flex items-center gap-1 rounded-[4px] bg-white/5 px-1 text-[10px] leading-4 text-white/50"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                                {card.todo}
                              </span>
                            </LxTooltip>
                          )}
                          {card.inProgress > 0 && (
                            <LxTooltip content={`进行中 ${card.inProgress}`} placement="top">
                              <span
                                aria-label={`进行中 ${card.inProgress}`}
                                className="flex items-center gap-1 rounded-[4px] bg-amber-400/10 px-1 text-[10px] leading-4 text-amber-400"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                {card.inProgress}
                              </span>
                            </LxTooltip>
                          )}
                          {card.done > 0 && (
                            <LxTooltip content={`已完成 ${card.done}`} placement="top">
                              <span
                                aria-label={`已完成 ${card.done}`}
                                className="flex items-center gap-1 rounded-[4px] bg-emerald-400/10 px-1 text-[10px] leading-4 text-emerald-400"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                {card.done}
                              </span>
                            </LxTooltip>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 truncate text-[11px] text-white/40">
                      {card.projectName && (
                        <>
                          <Boxes className="h-3 w-3 shrink-0 text-sky-400/80" />
                          <span className="truncate">{card.projectName}</span>
                        </>
                      )}
                      {card.folderName && (
                        <>
                          <span className="shrink-0">/</span>
                          <Folder className="h-3 w-3 shrink-0 text-amber-400/80" />
                          <span className="truncate">{card.folderName}</span>
                        </>
                      )}
                    </div>
                    <button
                      aria-label="从最近列表移除"
                      type="button"
                      className="pointer-events-none absolute -right-1.5 -top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-[#3a3a3a] text-white/60 opacity-0 shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-[#4a4a4a] hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeRecentItem(card.id)
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <LxIconButton
          aria-label="向右滚动"
          disabled={!canScrollRight}
          size="medium"
          onClick={() => handleScroll("right")}
        >
          <ChevronRight className="h-4 w-4" />
        </LxIconButton>
      </div>
    </div>
  )
}
