// 主页视图标识（?view= 查询参数，None 值回退索引页）。
export type HomeView = "index" | "usage" | "schedule" | "game"

// 主页视图查询参数名。
export const HOME_VIEW_QUERY_KEY = "view"

// 解析查询参数为主页视图（非法值回退 index）。
export const parseHomeView = (value: string | null): HomeView =>
  value === "usage" || value === "schedule" || value === "game" ? value : "index"
