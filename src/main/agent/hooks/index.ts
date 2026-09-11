export { resolveHookShell, runHookCommand } from "./commandRunner"
export {
  buildHookPayload,
  dispatchHooks,
  firstBlock,
  firstPermissionDecision,
  firstStop,
  type HookDispatchContext,
  hookResultMessages,
  matchesHook,
} from "./dispatcher"
export {
  HOOK_EVENT_NAMES,
  hookConfig,
  isHookEventName,
  loadHooks,
  parseHookConfig,
  parseMatcher,
} from "./hookConfig"
export { hooksManager } from "./hooksManager"
export { parseHookOutput } from "./outputParser"
export type {
  HookCommandOutput,
  HookCommandPayload,
  HookDispatchInput,
  HookDispatchResult,
  HookRunResult,
  LoadedHook,
  ParsedHookOutput,
} from "./types"
