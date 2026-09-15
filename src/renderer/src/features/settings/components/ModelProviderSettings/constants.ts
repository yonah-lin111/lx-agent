import type { ModelProvider } from "@/features/settings/types"

export const PROVIDER_TYPES: ModelProvider["type"][] = [
  "openai-compatible",
  "openai",
  "anthropic",
  "google",
]
