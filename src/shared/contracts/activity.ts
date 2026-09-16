// 单日会话活跃记录（用于活动绿墙展示）。
export interface DailyActivity {
  date: string
  count: number
}

// 活动数据领域 preload API 契约。
export interface ActivityApi {
  activity: {
    getDaily: () => Promise<DailyActivity[]>
  }
}
