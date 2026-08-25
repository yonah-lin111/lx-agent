import { FRIENDLY_PERSONA } from "./friendly"
import { PRAGMATIC_PERSONA } from "./pragmatic"

export type PersonalityName = "pragmatic" | "friendly"

export { FRIENDLY_PERSONA, PRAGMATIC_PERSONA }

/** 获取指定人格的提示词文本（缺省为 pragmatic） */
export function getPersonalityPrompt(name: PersonalityName = "pragmatic"): string {
  switch (name) {
    case "friendly":
      return FRIENDLY_PERSONA
    case "pragmatic":
    default:
      return PRAGMATIC_PERSONA
  }
}
