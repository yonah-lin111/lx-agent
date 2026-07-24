/// <reference types="vite/client" />
import type { ProjectApi } from "@shared/project"

declare global {
  interface Window {
    api: ProjectApi
  }
}

export {}
