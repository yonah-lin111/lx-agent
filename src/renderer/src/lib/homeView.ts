// 主页视图标识（?view= 查询参数，None 值回退概览）。
export type HomeView = "overview" | "usage" | "schedule"

// 主页视图查询参数名。
export const HOME_VIEW_QUERY_KEY = "view"

// 解析查询参数为主页视图（非法值回退 overview）。
export const parseHomeView = (value: string | null): HomeView =>
  value === "usage" || value === "schedule" ? value : "overview"
