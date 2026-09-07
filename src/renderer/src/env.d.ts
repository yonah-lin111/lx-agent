/// <reference types="vite/client" />

import type { ClipboardApi } from "@shared/clipboard"
import type { AgentApi } from "@shared/contracts/agent"
import type { CustomCommandApi } from "@shared/contracts/customCommand"
import type { GitApi } from "@shared/contracts/git"
import type { MarkdownApi } from "@shared/contracts/markdown"
import type { PromptHistoryApi } from "@shared/contracts/promptHistory"
import type { TerminalApi } from "@shared/contracts/terminal"
import type { ProjectApi } from "@shared/project"
import type { SettingsApi } from "@shared/settings"

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
      TerminalApi
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          preload?: string
          httpreferrer?: string
          useragent?: string
          disablewebsecurity?: boolean
          partition?: string
          allowpopups?: boolean
          webpreferences?: string
          nodeintegration?: boolean
        },
        HTMLElement
      >
    }
  }
}

export {}
