/**
 * 渲染页面顶部栏。
 */
import { Check, ChevronDown, ChevronUp, Palette, Tags } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useLocation, useSearchParams } from "react-router-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxBreadcrumbToast, useLxBreadcrumbToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { ProjectRecentItemsTags } from "@/features/project/components/ProjectRecentItemsTags"
import { createProjectNavigationTree, projectNavigationApi } from "@/features/project-navigation"
import { SETTINGS_SECTIONS } from "@/features/settings/constants"
import { UI_SECTIONS } from "@/features/ui-preview"
import { useTranslation } from "@/i18n"
import { PRIMARY_NAVIGATION_ITEMS } from "@/lib/navigationItems"
import { PAGE_ROUTES } from "@/lib/pageRoutes"
import { type AppTheme, useAppTheme } from "@/stores/themeStore"

// tag 栏退场动画时长，与面包屑入场动画时长一致。
const TAGS_LEAVE_DURATION = 300

// 项目页面包屑名称。
interface ProjectBreadcrumb {
  projectName: string
  folderName: string
  itemName: string
}

// 顶部栏属性。
interface HeaderSideBarProps {
  isExpanded: boolean
  onExpandedChange: (isExpanded: boolean) => void
  children?: React.ReactNode
}

export const HeaderSideBar = ({
  isExpanded,
  onExpandedChange,
  children,
}: HeaderSideBarProps): React.JSX.Element => {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get("itemId")
  const settingsSection = searchParams.get("section") ?? SETTINGS_SECTIONS[0].id
  const uiSection = searchParams.get("section") ?? UI_SECTIONS[0].id
  const [projectBreadcrumb, setProjectBreadcrumb] = useState<ProjectBreadcrumb | null>(null)
  // 是否将顶部行从面包屑切换为最近打开 tag 栏。
  const [showRecentTags, setShowRecentTags] = useState(false)
  // tag 栏退场动画播放期间仍保留渲染，结束后卸载。
  const [isTagsLeaving, setIsTagsLeaving] = useState(false)
  const tagsLeaveTimerRef = useRef<number | null>(null)
  const renderTags = showRecentTags || isTagsLeaving
  const breadcrumbToasts = useLxBreadcrumbToast()
  const hasBreadcrumbToast = breadcrumbToasts.length > 0
  const activeNavigationItem =
    PRIMARY_NAVIGATION_ITEMS.find((item) => item.path === pathname) ?? PRIMARY_NAVIGATION_ITEMS[0]

  useEffect(() => {
    if (pathname !== PAGE_ROUTES.project || !itemId) {
      setProjectBreadcrumb(null)
      return
    }

    setProjectBreadcrumb(null)
    let isCurrent = true
    const loadProjectBreadcrumb = async (): Promise<void> => {
      try {
        const [projects, folders, items] = await Promise.all([
          projectNavigationApi.listProjects(),
          projectNavigationApi.listFolders(),
          projectNavigationApi.listItems(),
        ])
        const navigationProjects = createProjectNavigationTree(projects, folders, items)
        for (const project of navigationProjects) {
          const projectItem = project.prompts.find((prompt) => prompt.id === itemId)
          if (projectItem) {
            if (isCurrent) {
              setProjectBreadcrumb({
                projectName: project.name,
                folderName: "GENERAL",
                itemName: projectItem.name,
              })
            }
            return
          }

          const folder = project.projectFolders.find((item) =>
            item.prompts.some((prompt) => prompt.id === itemId),
          )
          const folderItem = folder?.prompts.find((prompt) => prompt.id === itemId)
          if (folder && folderItem) {
            if (isCurrent) {
              setProjectBreadcrumb({
                projectName: project.name,
                folderName: folder.name,
                itemName: folderItem.name,
              })
            }
            return
          }
        }
      } catch (error) {
        console.error("Failed to load breadcrumb", error)
      }
    }

    void loadProjectBreadcrumb()
    return () => {
      isCurrent = false
    }
  }, [itemId, pathname])

  // 切换 tag 栏显示：关闭时先播放退场动画，结束后再卸载。
  const handleToggleRecentTags = (): void => {
    const next = !showRecentTags
    setShowRecentTags(next)
    if (next) {
      if (tagsLeaveTimerRef.current !== null) {
        window.clearTimeout(tagsLeaveTimerRef.current)
        tagsLeaveTimerRef.current = null
      }
      setIsTagsLeaving(false)
      return
    }
    if (tagsLeaveTimerRef.current === null) {
      setIsTagsLeaving(true)
      tagsLeaveTimerRef.current = window.setTimeout(() => {
        tagsLeaveTimerRef.current = null
        setIsTagsLeaving(false)
      }, TAGS_LEAVE_DURATION)
    }
  }

  // 卸载时清理退场定时器。
  useEffect(() => {
    return () => {
      if (tagsLeaveTimerRef.current !== null) {
        window.clearTimeout(tagsLeaveTimerRef.current)
      }
    }
  }, [])

  const { t } = useTranslation()

  const breadcrumbParts =
    pathname === PAGE_ROUTES.project && projectBreadcrumb
      ? [
          activeNavigationItem.breadcrumbCategory,
          projectBreadcrumb.projectName,
          `${projectBreadcrumb.folderName} - ${projectBreadcrumb.itemName}`,
        ]
      : [activeNavigationItem.breadcrumbCategory]
  if (pathname === PAGE_ROUTES.settings) {
    const section = SETTINGS_SECTIONS.find((item) => item.id === settingsSection)
    if (section) breadcrumbParts.push(t(section.labelKey))
  }
  if (pathname === PAGE_ROUTES.ui) {
    const section = UI_SECTIONS.find((item) => item.id === uiSection)
    if (section) breadcrumbParts.push(section.label)
  }

  const { theme, setTheme } = useAppTheme()

  const THEME_OPTIONS: { id: AppTheme; label: string }[] = [
    { id: "default", label: "Default" },
    { id: "minecraft", label: "Minecraft" },
    { id: "wood", label: "Wood" },
  ]

  return (
    <header
      className={`header-sidebar mb-2 shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-2 transition-[height,min-height,max-height] duration-300 ease-in-out ${
        isExpanded ? "h-[300px] min-h-[300px] max-h-[300px]" : "h-[40px] min-h-[40px] max-h-[40px]"
      }`}
    >
      <div className="relative h-full w-full">
        <div className="flex h-6 w-full items-center justify-between">
          <div className="flex h-6 min-w-0 flex-1 items-center gap-2 mr-2 text-xs font-mono">
            {hasBreadcrumbToast ? (
              <LxBreadcrumbToast />
            ) : renderTags ? (
              <div
                className={`flex min-w-0 flex-1 items-center ${
                  isTagsLeaving
                    ? "animate-header-breadcrumb-out pointer-events-none"
                    : "animate-header-breadcrumb-in"
                }`}
              >
                <ProjectRecentItemsTags />
              </div>
            ) : (
              <div
                key={`${pathname}-${itemId ?? ""}-${settingsSection}-${uiSection}-${projectBreadcrumb?.itemName ?? ""}`}
                className="header-breadcrumb flex min-w-0 items-center gap-1.5 animate-header-breadcrumb-in"
              >
                <span className="header-breadcrumb-slash inline-flex items-center rounded-[4px] border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/50 text-[11px] shadow-xs">
                  //
                </span>
                {breadcrumbParts.map((part, index) => (
                  <span
                    key={`${part}-${index}`}
                    className="flex min-w-0 items-center gap-1.5 truncate"
                  >
                    {index > 0 && (
                      <span className="header-breadcrumb-slash inline-flex items-center rounded-[4px] border border-white/10 bg-white/5 px-1 py-0.5 text-white/40 text-[11px] shadow-xs shrink-0">
                        /
                      </span>
                    )}
                    <span
                      className={`header-breadcrumb-part inline-flex min-w-0 items-center rounded-[5px] border border-white/10 bg-white/5 px-2 py-0.5 truncate font-bold text-xs shadow-xs ${
                        index === 0 ? "uppercase tracking-wider text-white/60" : "text-white"
                      }`}
                    >
                      {part}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex h-6 shrink-0 items-center gap-2">
            <LxIconButton
              aria-label={t("header.showRecentTags")}
              highlighted={showRecentTags}
              title={{
                content: showRecentTags ? t("header.hideRecentTags") : t("header.showRecentTags"),
                placement: "bottom",
              }}
              onClick={handleToggleRecentTags}
              size="small"
            >
              <Tags className="h-3.5 w-3.5" />
            </LxIconButton>
            <LxTooltip
              placement="bottom"
              trigger="click"
              closeOnContentClick
              content={
                <div className="theme-menu-dropdown flex flex-col gap-0.5 py-0.5 min-w-[90px]">
                  {THEME_OPTIONS.map((opt) => {
                    const isSelected = theme === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTheme(opt.id)}
                        className={`theme-menu-option flex w-full cursor-pointer items-center justify-between gap-3 rounded-[4px] px-2 py-1 text-left text-xs transition-colors ${
                          isSelected
                            ? "bg-white/10 font-semibold text-white"
                            : "text-white/70 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <Check className="h-3 w-3 shrink-0 text-emerald-400" />}
                      </button>
                    )
                  })}
                </div>
              }
            >
              <LxIconButton aria-label={t("header.switchTheme")} size="small">
                <Palette className="h-3.5 w-3.5" />
              </LxIconButton>
            </LxTooltip>
            <LxIconButton
              aria-label={isExpanded ? t("header.collapseHeader") : t("header.expandHeader")}
              size="small"
              title={{
                content: isExpanded ? t("header.collapseHeader") : t("header.expandHeader"),
                placement: "bottom",
              }}
              onClick={() => onExpandedChange(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </LxIconButton>
          </div>
        </div>
        <div
          className={`absolute inset-x-0 bottom-0 top-8 overflow-hidden ${
            isExpanded ? "" : "invisible"
          }`}
        >
          {children}
        </div>
      </div>
    </header>
  )
}
