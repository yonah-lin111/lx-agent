/// <reference types="vite/client" />

import type { ClipboardApi } from "@shared/clipboard"
import type { AgentApi } from "@shared/contracts/agent"
import type { MarkdownApi } from "@shared/contracts/markdown"
import type { ProjectApi } from "@shared/project"
import type { SettingsApi } from "@shared/settings"

declare global {
  interface Window {
    api: ProjectApi & ClipboardApi & SettingsApi & AgentApi & MarkdownApi
  }
}

export {}
