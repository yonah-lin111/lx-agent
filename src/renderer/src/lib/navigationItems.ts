import { FolderKanban, House, Settings } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

// 全局底部导航项。
export const PRIMARY_NAVIGATION_ITEMS: Array<{
  icon: LucideIcon
  label: string
  path: string
}> = [
  { icon: House, label: "主页", path: PAGE_ROUTES.home },
  { icon: FolderKanban, label: "项目", path: PAGE_ROUTES.project },
  { icon: Settings, label: "设置", path: PAGE_ROUTES.settings },
]
