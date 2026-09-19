/**
 * 渲染页面顶部栏。
 */
import { Check, ChevronDown, ChevronUp, Palette, Tags } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation, useSearchParams } from "react-router-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMenuItem } from "@/components/ui/LxMenuItem"
import { LxTag } from "@/components/ui/LxTag"
import { LxBreadcrumbToast, useLxBreadcrumbToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { ProjectRecentItemsTags } from "@/features/project/components/ProjectRecentItemsTags"
import { createProjectNavigationTree, projectNavigationApi } from "@/features/project-navigation"
import { HeaderSchedulePanel } from "@/features/schedule"
import { SETTINGS_SECTIONS } from "@/features/settings/constants"
import { UI_SECTIONS } from "@/features/ui-preview"
import { useTranslation } from "@/i18n"
import { HOME_VIEW_QUERY_KEY, parseHomeView } from "@/lib/homeView"
import { PRIMARY_NAVIGATION_ITEMS } from "@/lib/navigationItems"
import { PAGE_ROUTES } from "@/lib/pageRoutes"
import { type AppTheme, useAppTheme } from "@/stores/themeStore"

// 项目页面包屑名称。
interface ProjectBreadcrumb {
  projectName: string
  folderNames: string[]
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
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get("itemId")
  const settingsSection = searchParams.get("section") ?? SETTINGS_SECTIONS[0].id
  const uiSection = searchParams.get("section") ?? UI_SECTIONS[0].id
  const homeView = parseHomeView(searchParams.get(HOME_VIEW_QUERY_KEY))
  const [projectBreadcrumb, setProjectBreadcrumb] = useState<ProjectBreadcrumb | null>(null)
  // 是否将顶部行从面包屑切换为最近打开 tag 栏。
  const [showRecentTags, setShowRecentTags] = useState(false)
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
        if (itemId.startsWith("temp-")) {
          const targetProjectId = itemId.slice("temp-".length)
          const projects = await projectNavigationApi.listProjects()
          if (!isCurrent) return
          const project = projects.find((p) => p.id === targetProjectId)
          if (project) {
            setProjectBreadcrumb({
              projectName: project.name,
              folderNames: [],
              itemName: t("project.temporaryPrompt"),
            })
          }
          return
        }

        const [projects, folders, items] = await Promise.all([
          projectNavigationApi.listProjects(),
          projectNavigationApi.listFolders(),
          projectNavigationApi.listItems(),
        ])
        const navigationProjects = createProjectNavigationTree(projects, folders, items)

        const findItemInFolders = (
          foldersList: (typeof navigationProjects)[number]["projectFolders"],
          trail: string[],
        ): { folderNames: string[]; itemName: string } | null => {
          for (const folder of foldersList) {
            const currentTrail = [...trail, folder.name]
            const prompt = folder.prompts.find((p) => p.id === itemId)
            if (prompt) {
              return { folderNames: currentTrail, itemName: prompt.name }
            }
            const nested = findItemInFolders(folder.projectFolders, currentTrail)
            if (nested) return nested
          }
          return null
        }

        for (const project of navigationProjects) {
          const projectItem = project.prompts.find((prompt) => prompt.id === itemId)
          if (projectItem) {
            if (isCurrent) {
              setProjectBreadcrumb({
                projectName: project.name,
                folderNames: ["GENERAL"],
                itemName: projectItem.name,
              })
            }
            return
          }

          const match = findItemInFolders(project.projectFolders, [])
          if (match) {
            if (isCurrent) {
              setProjectBreadcrumb({
                projectName: project.name,
                folderNames: match.folderNames,
                itemName: match.itemName,
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
  }, [itemId, pathname, t])

  // 切换 tag 栏与面包屑显示。
  const handleToggleRecentTags = (): void => {
    setShowRecentTags((current) => !current)
  }

  const breadcrumbParts =
    pathname === PAGE_ROUTES.project && projectBreadcrumb
      ? [
          activeNavigationItem.breadcrumbCategory,
          projectBreadcrumb.projectName,
          ...projectBreadcrumb.folderNames,
          projectBreadcrumb.itemName,
        ]
      : [activeNavigationItem.breadcrumbCategory]
  if (pathname === PAGE_ROUTES.home) {
    const labelKey =
      homeView === "schedule"
        ? "home.schedule"
        : homeView === "usage"
          ? "usage.title"
          : homeView === "game"
            ? "game.title"
            : "home.index.label"
    breadcrumbParts.push(t(labelKey))
  }
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
    { id: "default", label: t("header.themeDefault") },
    { id: "pixel", label: t("header.themePixel") },
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
            ) : showRecentTags ? (
              <div className="flex min-w-0 flex-1 items-center">
                <ProjectRecentItemsTags />
              </div>
            ) : (
              <div
                key={`${pathname}-${itemId ?? ""}-${settingsSection}-${uiSection}-${homeView}-${projectBreadcrumb?.itemName ?? ""}`}
                className="header-breadcrumb flex min-w-0 items-center gap-1.5 animate-header-breadcrumb-in"
              >
                <LxTag
                  size="small"
                  bgClass="border-white/10 bg-white/5"
                  textClass="text-white/50"
                  className="header-breadcrumb-slash shrink-0 shadow-xs"
                >
                  //
                </LxTag>
                {breadcrumbParts.map((part, index) => (
                  <span
                    key={`${part}-${index}`}
                    className="flex min-w-0 items-center gap-1.5 truncate"
                  >
                    {index > 0 && (
                      <LxTag
                        size="small"
                        bgClass="border-white/10 bg-white/5"
                        textClass="text-white/40"
                        className="header-breadcrumb-slash shrink-0 shadow-xs"
                      >
                        /
                      </LxTag>
                    )}
                    <LxTag
                      size="small"
                      bgClass="border-white/10 bg-white/5"
                      textClass={index === 0 ? "text-white/60" : "text-white"}
                      className={`header-breadcrumb-part min-w-0 shadow-xs ${
                        index === 0 ? "uppercase tracking-wider" : ""
                      }`}
                    >
                      {part}
                    </LxTag>
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
              <Tags />
            </LxIconButton>
            <LxTooltip
              hover={{
                content: t("header.switchTheme"),
                placement: "bottom",
              }}
              click={{
                content: (
                  <div className="theme-menu-dropdown flex flex-col gap-0.5 py-0.5 min-w-[90px]">
                    {THEME_OPTIONS.map((opt) => {
                      const isSelected = theme === opt.id
                      return (
                        <LxMenuItem
                          key={opt.id}
                          active={isSelected}
                          trailing={isSelected ? <Check className="text-emerald-400" /> : null}
                          onClick={() => setTheme(opt.id)}
                        >
                          {opt.label}
                        </LxMenuItem>
                      )
                    })}
                  </div>
                ),
                placement: "bottom",
                closeOnContentClick: true,
              }}
            >
              <LxIconButton aria-label={t("header.switchTheme")} size="small">
                <Palette />
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
              {isExpanded ? <ChevronUp /> : <ChevronDown />}
            </LxIconButton>
          </div>
        </div>
        <div
          className={`absolute inset-x-0 bottom-0 top-8 overflow-hidden ${
            isExpanded ? "" : "invisible"
          }`}
        >
          {/* 展开区左右等分容器：左侧今日待办面板，右侧 children 插槽。
              像素主题下由 .header-expand-pane 叠加 3D 浮雕；默认主题以右侧边框线分隔。 */}
          <div className="flex h-full min-h-0 w-full">
            <div className="header-expand-pane flex h-full min-w-0 flex-1 flex-col overflow-hidden border-r border-white/10 p-2">
              <HeaderSchedulePanel isExpanded={isExpanded} />
            </div>
            <div className="header-expand-pane min-w-0 flex-1 overflow-hidden p-2">{children}</div>
          </div>
        </div>
      </div>
    </header>
  )
}
