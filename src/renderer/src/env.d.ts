/// <reference types="vite/client" />

import type { ClipboardApi } from "@shared/clipboard"
import type { ActivityApi } from "@shared/contracts/activity"
import type { AgentApi } from "@shared/contracts/agent"
import type { CustomCommandApi } from "@shared/contracts/customCommand"
import type { GameApi } from "@shared/contracts/game"
import type { GitApi } from "@shared/contracts/git"
import type { MarkdownApi } from "@shared/contracts/markdown"
import type { NotificationApi } from "@shared/contracts/notification"
import type { OpenClawApi } from "@shared/contracts/openclaw"
import type { PromptHistoryApi } from "@shared/contracts/promptHistory"
import type { ScheduleApi } from "@shared/contracts/schedule"
import type { TerminalApi } from "@shared/contracts/terminal"
import type { UpdateApi } from "@shared/contracts/update"
import type { UsageApi } from "@shared/contracts/usage"
import type { ProjectApi } from "@shared/project"
import type { SettingsApi } from "@shared/settings"

declare module "react" {
  interface WebViewHTMLAttributes<T> extends HTMLAttributes<T> {
    allowpopups?: boolean | "true" | "false" | undefined
    disablewebsecurity?: boolean | "true" | "false" | undefined
  }
}

declare global {
  interface Window {
    api: ProjectApi &
      ClipboardApi &
      SettingsApi &
      AgentApi &
      MarkdownApi &
      CustomCommandApi &
      GitApi &
      PromptHistoryApi &
      TerminalApi &
      ActivityApi &
      UsageApi &
      ScheduleApi &
      OpenClawApi &
      NotificationApi &
      UpdateApi &
      GameApi
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.WebViewHTMLAttributes<HTMLElement> & {
          src?: string
          preload?: string
          httpreferrer?: string
          useragent?: string
          disablewebsecurity?: boolean | "true" | "false"
          partition?: string
          allowpopups?: boolean | "true" | "false"
          webpreferences?: string
          nodeintegration?: boolean
        },
        HTMLElement
      >
    }
  }
}

export {}
