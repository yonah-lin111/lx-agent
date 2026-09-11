import type { TranslationKey } from "@/i18n"
import type { OfficeAgentStatus } from "../agentStatus"

// 员工状态指示灯配色。
export const OFFICE_STATUS_DOT_CLASS: Record<OfficeAgentStatus, string> = {
  working: "bg-emerald-400 animate-pulse",
  connecting: "bg-amber-400 animate-pulse",
  blocked: "bg-amber-400",
  idle: "bg-zinc-500",
  offline: "bg-zinc-700",
  error: "bg-rose-400",
}

// 员工状态文案。
export const OFFICE_STATUS_LABEL_KEY: Record<OfficeAgentStatus, TranslationKey> = {
  working: "openclaw.statusWorking",
  connecting: "openclaw.statusConnecting",
  blocked: "openclaw.statusBlocked",
  idle: "openclaw.statusIdle",
  offline: "openclaw.statusDisconnected",
  error: "openclaw.statusError",
}
