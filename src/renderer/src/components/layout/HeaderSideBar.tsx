/**
 * 渲染页面顶部栏。
 */
import { ChevronDown, ChevronUp } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation, useSearchParams } from "react-router-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { getLxToastColorClass, useLxToast } from "@/components/ui/LxToast"
import { createProjectNavigationTree, projectNavigationApi } from "@/features/project-navigation"
import { SETTINGS_SECTIONS } from "@/features/settings/constants"
import { UI_SECTIONS } from "@/features/ui-preview"
import { PRIMARY_NAVIGATION_ITEMS } from "@/lib/navigationItems"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

interface HeaderSideBarProps {
  isExpanded: boolean
  onExpandedChange: (isExpanded: boolean) => void
  children?: React.ReactNode
}

// 项目页面包屑名称。
interface ProjectBreadcrumb {
  projectName: string
  folderName: string
  itemName: string
}

export const HeaderSideBar = ({
  isExpanded,
  onExpandedChange,
  children,
}: HeaderSideBarProps): React.JSX.Element => {
  const { toasts } = useLxToast()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get("itemId")
  const settingsSection = searchParams.get("section") ?? SETTINGS_SECTIONS[0].id
  const uiSection = searchParams.get("section") ?? UI_SECTIONS[0].id
  const [projectBreadcrumb, setProjectBreadcrumb] = useState<ProjectBreadcrumb | null>(null)
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
    if (section) breadcrumbParts.push(section.label)
  }
  if (pathname === PAGE_ROUTES.ui) {
    const section = UI_SECTIONS.find((item) => item.id === uiSection)
    if (section) breadcrumbParts.push(section.label)
  }

  return (
    <header
      className={`mb-2 shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-2 transition-[height,min-height,max-height] duration-300 ease-in-out ${
        isExpanded ? "h-[300px] min-h-[300px] max-h-[300px]" : "h-[40px] min-h-[40px] max-h-[40px]"
      }`}
    >
      <div className="relative h-full w-full">
        <div
          key={`${pathname}-${itemId ?? ""}-${settingsSection}-${uiSection}-${projectBreadcrumb?.itemName ?? ""}`}
          className="absolute left-0 top-0 flex h-6 max-w-[calc(100%-48px)] items-center gap-2 truncate text-xs font-mono animate-header-breadcrumb-in"
        >
          <span className="text-white/30">//</span>
          {breadcrumbParts.map((part, index) => (
            <span key={`${part}-${index}`} className="flex min-w-0 items-center gap-2 truncate">
              {index > 0 && <span className="shrink-0 text-white/20">/</span>}
              <span
                className={`truncate font-bold ${
                  index === 0 ? "uppercase tracking-wider text-white/40" : "text-white"
                }`}
              >
                {part}
              </span>
            </span>
          ))}
        </div>
        <div
          className={`absolute inset-x-0 bottom-0 top-8 overflow-hidden ${
            isExpanded ? "" : "invisible"
          }`}
        >
          {children}
        </div>
        <div
          className={`absolute right-0 top-0 flex items-center gap-2 transition-transform duration-300 ease-in-out ${
            isExpanded ? "translate-y-0" : "-translate-y-0.5"
          }`}
        >
          <div className="min-w-0 max-w-[calc(100vw-96px)]">
            {toasts.map((toast) => (
              <span
                key={toast.id}
                aria-hidden="true"
                className={`block truncate text-xs font-medium tracking-wide select-none ${getLxToastColorClass(toast.type)} ${
                  toast.isExiting ? "animate-toast-out" : "animate-toast-in"
                }`}
              >
                {toast.message}
              </span>
            ))}
          </div>
          <LxIconButton
            aria-label={isExpanded ? "折叠顶部栏" : "展开顶部栏"}
            title={{ content: isExpanded ? "折叠顶部栏" : "展开顶部栏", placement: "bottom" }}
            onClick={() => onExpandedChange(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </LxIconButton>
        </div>
      </div>
    </header>
  )
}
