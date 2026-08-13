import type { PromptHistoryApi } from "@shared/contracts/promptHistory"

// Agent feature 对提示词历史 preload API 的访问层。
export const promptHistoryApi: PromptHistoryApi["promptHistory"] = {
  get: () => window.api.promptHistory.get(),
  add: (text: string) => window.api.promptHistory.add(text),
}
