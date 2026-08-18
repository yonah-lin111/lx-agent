import type { ReferencedFolder } from "@shared/project"
import { Check, ChevronLeft, ChevronRight, Copy, Folder, FolderPlus, Pin } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInRouterContext, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import {
  createMarkdownReference,
  getMarkdownReferenceName,
} from "@/features/markdown/commands/markdownReferenceCommands"
import { projectApi } from "@/features/project/api/projectApi"
import { ReferencedFolderCommandMenu } from "@/features/project/components/ReferencedFolderCommandMenu"
import { useProjectReferencedFoldersStore } from "@/features/project/referencedFoldersStore"

interface ProjectReferencedFolderTagsProps {
  className?: string
}

// 防止 Zustand 选择器因返回新数组而重复渲染。
const EMPTY_REFERENCED_FOLDERS: ReferencedFolder[] = []
const EMPTY_ENABLED_FOLDER_PATHS: string[] = []

// loading 最短展示时长，避免 IPC 过快时闪烁。
const MIN_LOADING_DURATION = 300
// loading 淡出时长。
const FADE_OUT_DURATION = 300

// 换算 CSS 中的尺寸为像素，用于命令面板在可视区域内的边界定位。
const getCssDimensionInPixels = (variableName: string): number => {
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()
  const value = Number.parseFloat(cssValue)
  if (!Number.isFinite(value)) return 0

  if (cssValue.endsWith("rem")) {
    return value * Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  }
  if (cssValue.endsWith("vh")) return (value / 100) * window.innerHeight
  if (cssValue.endsWith("vw")) return (value / 100) * window.innerWidth

  return value
}

// 已打开的文件夹面板。
interface FolderPanelState {
  folderPath: string
  position: React.CSSProperties
}

const ProjectReferencedFolderTagsContent = ({
  className = "",
}: ProjectReferencedFolderTagsProps): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get("itemId")
  const [projectId, setProjectId] = useState<string | null>(null)
  const [folderPanel, setFolderPanel] = useState<FolderPanelState | null>(null)
  const [copiedFolderPath, setCopiedFolderPath] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const loadingEndTimerRef = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const referencedFolders = useProjectReferencedFoldersStore((state) =>
    projectId
      ? (state.foldersByProjectId[projectId] ?? EMPTY_REFERENCED_FOLDERS)
      : EMPTY_REFERENCED_FOLDERS,
  )
  const enabledFolderPaths = useProjectReferencedFoldersStore((state) =>
    itemId
      ? (state.enabledPathsByItemId[itemId] ?? EMPTY_ENABLED_FOLDER_PATHS)
      : EMPTY_ENABLED_FOLDER_PATHS,
  )
  const setProjectReferencedFolders = useProjectReferencedFoldersStore(
    (state) => state.setProjectReferencedFolders,
  )
  const setItemEnabledPaths = useProjectReferencedFoldersStore((state) => state.setItemEnabledPaths)
  const removeEnabledPathFromAllItems = useProjectReferencedFoldersStore(
    (state) => state.removeEnabledPathFromAllItems,
  )
  const sortedFolders = useMemo(
    () =>
      [...referencedFolders].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [referencedFolders],
  )

  /**
   * 解析当前条目所属项目，并加载该条目的文件夹启用状态。
   * 同项目内切换条目时 projectId 不变，项目级目录无需重新加载。
   */
  useEffect(() => {
    let isCurrent = true
    if (loadingEndTimerRef.current !== null) {
      window.clearTimeout(loadingEndTimerRef.current)
      loadingEndTimerRef.current = null
    }
    setIsFadingOut(false)

    if (!itemId) {
      setProjectId(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const startedAt = Date.now()

    void projectApi
      .list()
      .then((items) => {
        const item = items.find((entry) => entry.id === itemId)
        if (!isCurrent || !item) return
        setProjectId((current) => (current === item.projectId ? current : item.projectId))
        setItemEnabledPaths(itemId, item.enabledFolderPaths)
      })
      .catch((error) => {
        if (isCurrent) console.error("Failed to load item references", error)
      })
      .finally(() => {
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
  }, [itemId, setItemEnabledPaths])

  /**
   * 项目变化时加载该项目的共享文件夹目录。
   */
  useEffect(() => {
    let isCurrent = true

    if (!projectId) return

    void projectApi
      .listProjects()
      .then((projects) => {
        const project = projects.find((item) => item.id === projectId)
        if (!isCurrent || !project) return
        setProjectReferencedFolders(projectId, project.referencedFolders)
      })
      .catch((error) => {
        if (isCurrent) console.error("Failed to load project references", error)
      })

    return () => {
      isCurrent = false
    }
  }, [projectId, setProjectReferencedFolders])

  /**
   * 打开文件夹标签上方的内容面板。
   */
  const openFolderPanel = useCallback((folderPath: string, event: React.MouseEvent): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const panelWidth = getCssDimensionInPixels("--markdown-command-menu-file-width") || 480
    const left = Math.min(Math.max(rect.left, 8), Math.max(window.innerWidth - panelWidth - 8, 8))
    setFolderPanel({
      folderPath,
      position: { left, bottom: window.innerHeight - rect.top + 6 },
    })
  }, [])

  /**
   * 删除项目级共享文件夹引用，并同步清理所有条目的启用状态。
   */
  const removeFolderReference = useCallback(
    (path: string): void => {
      if (!projectId) return

      const nextFolders = referencedFolders.filter((folder) => folder.path !== path)
      const previousEnabledPaths = useProjectReferencedFoldersStore.getState().enabledPathsByItemId
      setProjectReferencedFolders(projectId, nextFolders)
      removeEnabledPathFromAllItems(path)
      void projectApi.updateProject(projectId, { referencedFolders: nextFolders }).catch(() => {
        setProjectReferencedFolders(projectId, referencedFolders)
        useProjectReferencedFoldersStore.setState({ enabledPathsByItemId: previousEnabledPaths })
      })

      void projectApi
        .list()
        .then((items) =>
          Promise.all(
            items
              .filter(
                (item) => item.projectId === projectId && item.enabledFolderPaths?.includes(path),
              )
              .map((item) =>
                projectApi.update(item.id, {
                  enabledFolderPaths: item.enabledFolderPaths.filter(
                    (itemPath) => itemPath !== path,
                  ),
                }),
              ),
          ),
        )
        .catch((error) => {
          console.error("Failed to clear folder enabled state", error)
        })
    },
    [projectId, referencedFolders, setProjectReferencedFolders, removeEnabledPathFromAllItems],
  )

  /**
   * 切换当前条目对该文件夹的启用状态。
   */
  const toggleFolderReference = useCallback(
    (path: string): void => {
      if (!itemId) return

      const nextPaths = enabledFolderPaths.includes(path)
        ? enabledFolderPaths.filter((itemPath) => itemPath !== path)
        : [...enabledFolderPaths, path]
      setItemEnabledPaths(itemId, nextPaths)
      void projectApi.update(itemId, { enabledFolderPaths: nextPaths }).catch(() => {
        setItemEnabledPaths(itemId, enabledFolderPaths)
      })
    },
    [itemId, enabledFolderPaths, setItemEnabledPaths],
  )

  /**
   * 添加项目级共享文件夹引用，默认不启用。
   */
  const addFolderReference = useCallback(
    (path: string): void => {
      if (!projectId) return

      const trimmed = path.trim()
      if (!trimmed) return
      if (referencedFolders.some((folder) => folder.path === trimmed)) return

      const newFolder: ReferencedFolder = {
        path: trimmed,
        createdAt: new Date().toISOString(),
      }
      const nextFolders = [...referencedFolders, newFolder]
      setProjectReferencedFolders(projectId, nextFolders)
      void projectApi.updateProject(projectId, { referencedFolders: nextFolders }).catch(() => {
        setProjectReferencedFolders(projectId, referencedFolders)
      })
    },
    [projectId, referencedFolders, setProjectReferencedFolders],
  )

  /**
   * 打开系统目录选择器并添加选中的文件夹引用。
   */
  const handlePickFolder = async (): Promise<void> => {
    if (!projectId) return
    const path = await projectApi.selectDirectory()
    if (path) addFolderReference(path)
  }

  /**
   * 复制文件夹引用的 Markdown 文本。
   */
  const copyFolderReference = async (path: string): Promise<void> => {
    await navigator.clipboard.writeText(createMarkdownReference("folder", path))
    setCopiedFolderPath(path)
    window.setTimeout(
      () => setCopiedFolderPath((current) => (current === path ? null : current)),
      1500,
    )
  }

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
  }, [sortedFolders, updateScrollState])

  const handleScroll = useCallback((direction: "left" | "right"): void => {
    const el = scrollRef.current
    if (!el) return
    const scrollAmount = direction === "left" ? -200 : 200
    el.scrollBy({ left: scrollAmount, behavior: "smooth" })
  }, [])

  return (
    <div className={`relative flex min-w-0 max-w-full items-center overflow-hidden ${className}`}>
      <div className="flex min-w-0 max-w-full flex-1 items-center justify-end gap-1 overflow-hidden">
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
          {isLoading ? (
            <div
              className={`flex items-center gap-1.5 transition-opacity duration-300 ease-out ${
                isFadingOut ? "opacity-0" : "opacity-100"
              }`}
            >
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="flex animate-pulse items-center gap-1 rounded-[6px] border border-white/5 bg-white/[0.03] px-2 py-1"
                >
                  <div className="h-3 w-3 shrink-0 rounded-[4px] bg-white/10" />
                  <div
                    className={`h-3 rounded-[4px] bg-white/10 ${
                      ["w-16", "w-24", "w-20"][index] ?? "w-20"
                    }`}
                  />
                  <div className="h-2.5 w-2.5 shrink-0 rounded-[4px] bg-white/[0.06]" />
                </div>
              ))}
            </div>
          ) : (
            <div className="animate-fade-in flex min-w-0 items-center gap-1">
              {sortedFolders.map((folder) => {
                const isCopied = copiedFolderPath === folder.path
                const isEnabled = enabledFolderPaths.includes(folder.path)

                return (
                  <LxTag
                    key={folder.path}
                    bgClass="border-[#d97706] bg-[rgba(217,119,6,0.12)] text-[#d97706]"
                    closeTooltipContent="是否要删除这个文件夹？"
                    hoverClass=""
                    prefix={<Folder className="h-3 w-3" />}
                    size="default"
                    suffix={
                      <>
                        <LxTooltip
                          content={
                            isEnabled ? "在 @ 命令中停用此文件夹" : "在 @ 命令中启用此文件夹"
                          }
                          placement="top"
                        >
                          <button
                            aria-label={
                              isEnabled ? "在 @ 命令中停用此文件夹" : "在 @ 命令中启用此文件夹"
                            }
                            className={`flex h-4 w-4 items-center justify-center rounded-[4px] transition-colors ${
                              isEnabled ? "text-[#fbbf24]" : "text-current/60 hover:text-current"
                            }`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleFolderReference(folder.path)
                            }}
                          >
                            <Pin
                              className="h-2.5 w-2.5"
                              fill={isEnabled ? "currentColor" : "none"}
                            />
                          </button>
                        </LxTooltip>
                        <LxTooltip content={isCopied ? "已复制" : "复制文件夹引用"} placement="top">
                          <button
                            aria-label="复制文件夹引用"
                            className={`flex h-4 w-4 items-center justify-center rounded-[4px] transition-colors ${
                              isCopied ? "text-current" : "text-current/60 hover:text-current"
                            }`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              void copyFolderReference(folder.path)
                            }}
                          >
                            {isCopied ? (
                              <Check className="h-2.5 w-2.5" />
                            ) : (
                              <Copy className="h-2.5 w-2.5" />
                            )}
                          </button>
                        </LxTooltip>
                      </>
                    }
                    onClick={(event) => openFolderPanel(folder.path, event)}
                    onClose={() => removeFolderReference(folder.path)}
                  >
                    {getMarkdownReferenceName(folder.path)}
                  </LxTag>
                )
              })}
            </div>
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
        <LxIconButton
          aria-label="添加文件夹"
          size="small"
          title={{ content: "添加文件夹", placement: "top" }}
          onClick={() => void handlePickFolder()}
        >
          <FolderPlus className="h-3.5 w-3.5 text-white/60 hover:text-white" />
        </LxIconButton>
      </div>
      {folderPanel && (
        <ReferencedFolderCommandMenu
          key={folderPanel.folderPath}
          folderPath={folderPanel.folderPath}
          position={folderPanel.position}
          onClose={() => setFolderPanel(null)}
        />
      )}
    </div>
  )
}

/**
 * 渲染项目共享文件夹引用标签栏。目录按项目共享，启用状态按条目独立。
 * 具备 Router 上下文检测，在无 Router 环境（如独立单元测试）下安全降级。
 */
export const ProjectReferencedFolderTags = (
  props: ProjectReferencedFolderTagsProps,
): React.JSX.Element | null => {
  const inRouter = useInRouterContext()
  if (!inRouter) return null
  return <ProjectReferencedFolderTagsContent {...props} />
}
