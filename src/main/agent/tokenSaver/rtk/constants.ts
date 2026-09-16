// RTK 过滤器常量（移植自 9router open-sse/rtk/constants.js，行为保持一致）。

// 单条工具输出参与压缩的字符窗口：低于下限跳过，超过上限直接放行。
export const MIN_COMPRESS_SIZE = 500
// 单条工具输出压缩上限（10 MiB）。
export const RAW_CAP = 10 * 1024 * 1024
// 自动探测只查看输出头部窗口（字符）。
export const DETECT_WINDOW = 1024
// git diff 单个 hunk 保留的最大行数。
export const GIT_DIFF_HUNK_MAX_LINES = 100
// git log 保留的最大行数。
export const GIT_LOG_MAX_LINES = 200
// 通用日志去重后的最大行数。
export const DEDUP_LINE_MAX = 2000
// grep 输出每个文件保留的最大匹配数。
export const GREP_PER_FILE_MAX = 10
// find 输出每个目录保留的最大文件数。
export const FIND_PER_DIR_MAX = 10
// find 输出保留的最大目录数。
export const FIND_TOTAL_DIR_MAX = 20
// git status 输出保留的最大暂存/修改文件数。
export const STATUS_MAX_FILES = 10
// git status 输出保留的最大未跟踪文件数。
export const STATUS_MAX_UNTRACKED = 10
// ls 摘要行展示的扩展名种类数。
export const LS_EXT_SUMMARY_TOP = 5
// ls 输出中被忽略的噪声目录。
export const LS_NOISE_DIRS = [
  "node_modules",
  ".git",
  "target",
  "__pycache__",
  ".next",
  "dist",
  "build",
  ".cache",
  ".turbo",
  ".vercel",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  ".venv",
  "venv",
  "env",
  "coverage",
  ".nyc_output",
  ".DS_Store",
  "Thumbs.db",
  ".idea",
  ".vscode",
  ".vs",
  "*.egg-info",
  ".eggs",
]
// tree 输出保留的最大行数。
export const TREE_MAX_LINES = 200
// 搜索结果列表输出每个目录保留的最大文件数。
export const SEARCH_LIST_PER_DIR_MAX = 10
// 搜索结果列表输出保留的最大目录数。
export const SEARCH_LIST_TOTAL_DIR_MAX = 20
// 智能截断保留的头部行数。
export const SMART_TRUNCATE_HEAD = 120
// 智能截断保留的尾部行数。
export const SMART_TRUNCATE_TAIL = 60
// 智能截断生效的最小行数。
export const SMART_TRUNCATE_MIN_LINES = 250
// 带行号文件输出判定为 read-numbered 的最小命中比例。
export const READ_NUMBERED_MIN_HIT_RATIO = 0.7

// 过滤器名称集合。
export const RTK_FILTER_NAMES = {
  GIT_DIFF: "git-diff",
  GIT_STATUS: "git-status",
  GIT_LOG: "git-log",
  GREP: "grep",
  FIND: "find",
  LS: "ls",
  TREE: "tree",
  DEDUP_LOG: "dedup-log",
  SMART_TRUNCATE: "smart-truncate",
  READ_NUMBERED: "read-numbered",
  SEARCH_LIST: "search-list",
  BUILD_OUTPUT: "build-output",
} as const

// 过滤器名称。
export type RtkFilterName = (typeof RTK_FILTER_NAMES)[keyof typeof RTK_FILTER_NAMES]
