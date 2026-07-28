/// <reference types="vite/client" />
import type { ClipboardApi } from "@shared/clipboard"
import type { ProjectApi } from "@shared/project"

declare global {
  interface Window {
    api: ProjectApi & ClipboardApi
  }
}

export {}
