/**
 * 工具描述中的调度提示（模型可见）：说明独立调用可放进同一条助手消息并发执行。
 *
 * 只读查询类内置工具与非 serial 的 MCP 工具各自复用一条文案，避免描述文案漂移。
 */

/** 只读查询类工具的描述后缀。 */
export const READ_ONLY_PARALLEL_HINT =
  "\n\nScheduling: read-only query tool — independent calls can be issued together in one assistant step and are executed concurrently."

/** 非 serial MCP 工具的描述后缀（server 未标记 serial 时同批调用并发执行）。 */
export const CONCURRENT_SCHEDULING_HINT =
  "\n\nScheduling: independent calls can be issued together in one assistant step and are executed concurrently."
