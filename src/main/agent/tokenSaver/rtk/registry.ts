// 过滤器注册表（移植自 9router open-sse/rtk/registry.js，仅保留自动探测所需入口）。
import { RTK_FILTER_NAMES, type RtkFilterName } from "./constants"
import { buildOutput } from "./filters/buildOutput"
import { dedupLog } from "./filters/dedupLog"
import { find } from "./filters/find"
import { gitDiff } from "./filters/gitDiff"
import { gitLog } from "./filters/gitLog"
import { gitStatus } from "./filters/gitStatus"
import { grep } from "./filters/grep"
import { ls } from "./filters/ls"
import { readNumbered } from "./filters/readNumbered"
import { searchList } from "./filters/searchList"
import { smartTruncate } from "./filters/smartTruncate"
import { tree } from "./filters/tree"

// 工具输出过滤器（名称 → 压缩函数）。
export const RTK_FILTERS: Record<RtkFilterName, (input: string) => string> = {
  [RTK_FILTER_NAMES.GIT_DIFF]: gitDiff,
  [RTK_FILTER_NAMES.GIT_STATUS]: gitStatus,
  [RTK_FILTER_NAMES.GIT_LOG]: gitLog,
  [RTK_FILTER_NAMES.GREP]: grep,
  [RTK_FILTER_NAMES.FIND]: find,
  [RTK_FILTER_NAMES.LS]: ls,
  [RTK_FILTER_NAMES.TREE]: tree,
  [RTK_FILTER_NAMES.DEDUP_LOG]: dedupLog,
  [RTK_FILTER_NAMES.SMART_TRUNCATE]: smartTruncate,
  [RTK_FILTER_NAMES.READ_NUMBERED]: readNumbered,
  [RTK_FILTER_NAMES.SEARCH_LIST]: searchList,
  [RTK_FILTER_NAMES.BUILD_OUTPUT]: buildOutput,
}
