// 提示词历史 IPC 接口：全局共享，新→旧排列。
export interface PromptHistoryApi {
  promptHistory: {
    // 获取全局历史提示词（新→旧）。
    get: () => Promise<string[]>
    // 追加一条提示词并返回更新后的历史（新→旧）。
    add: (text: string) => Promise<string[]>
  }
}
