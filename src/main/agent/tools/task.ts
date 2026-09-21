import type { SandboxPolicy, SubagentData, TextContent } from "@shared/contracts/agent"
import type { ModelSelection, SubagentSettings } from "@shared/settings"
import { DEFAULT_SUBAGENT_SETTINGS } from "@shared/settings"
import { z } from "zod"
import type {
  AfterToolCallContext,
  AfterToolCallResult,
  AgentTool,
  AgentToolResult,
  BeforeToolCallContext,
  BeforeToolCallResult,
  Model,
  ToolHookResult,
} from "../core/types"
import {
  buildAgentTypesDescription,
  type ResolvedAgentRole,
  resolveAgentRoles,
} from "../subagent/agentRoles"
import type { SubagentPool } from "../subagent/subagentPool"
import {
  type ChildCallInput,
  runSubagent,
  type SubagentRunnerDeps,
  type SubagentRunRequest,
  type SubagentRunResult,
} from "../subagent/subagentRunner"
import { SubagentRuntime } from "../subagent/subagentRuntime"

// 批量扇出单次调用条数上限（防病态任务一次挤爆上下文与内存）。
const MAX_BATCH_ITEMS = 64

// onUpdate 全量快照节流间隔（ms）。
const SNAPSHOT_THROTTLE_MS = 100

// 批量扇出单条子任务输入。
const TASK_ITEM_SCHEMA = z.object({
  description: z.string().describe("Brief task description (1-5 words) for progress display"),
  prompt: z
    .string()
    .describe("Complete task prompt to delegate to the sub-agent, must include sufficient context"),
  agent_type: z.string().optional().describe("Agent role name from the Available agent types list"),
  name: z.string().optional().describe("Sub-agent name or role (e.g., 'code-explorer' / 'coder')"),
})

// task 工具输入 schema：单任务模式（description + prompt）与批量扇出模式（tasks[]）二选一。
const TASK_INPUT_SCHEMA = z
  .object({
    description: z
      .string()
      .optional()
      .describe("Single-task mode: brief task description (1-5 words) for progress display"),
    prompt: z
      .string()
      .optional()
      .describe(
        "Single-task mode: complete task prompt to delegate to the sub-agent, must include sufficient context",
      ),
    agent_type: z
      .string()
      .optional()
      .describe("Single-task mode: agent role name from the Available agent types list"),
    name: z
      .string()
      .optional()
      .describe("Single-task mode: sub-agent name or role (e.g., 'code-explorer' / 'coder')"),
    subagent_id: z
      .string()
      .optional()
      .describe(
        "Subagent ID or name from a previous task call to resume the same sub-agent session with its full context history (e.g., 'subagent-1787802448377-dz12z' or 'code-explorer')",
      ),
    tasks: z
      .array(TASK_ITEM_SCHEMA)
      .min(1)
      .max(MAX_BATCH_ITEMS)
      .optional()
      .describe(
        `Batch fan-out mode: ${MAX_BATCH_ITEMS} items max, executed in parallel and returned in input order. Shard per item (one item per file/component/question) with independent prompts; batch items always spawn NEW sub-agents.`,
      ),
  })
  .refine(
    (value) => {
      const hasBatch = value.tasks !== undefined && value.tasks.length > 0
      if (hasBatch) {
        return value.description === undefined && value.prompt === undefined && !value.subagent_id
      }
      return value.description !== undefined && value.prompt !== undefined
    },
    {
      message:
        "Provide either a single task (description + prompt) or a tasks array (batch mode, new sub-agents only) — never both.",
    },
  )

export type TaskInput = z.infer<typeof TASK_INPUT_SCHEMA>

// 子代理工具结果 details（单任务 = subagent；批量 = subagents 按输入顺序）。
export interface SubagentDetails {
  subagent?: SubagentData
  subagents?: SubagentData[]
}

// task 工具依赖（agentRunner 装配时注入；execute 时解析）。
export interface TaskToolDeps {
  // 子代理基座系统提示词（已按子代理协作模式渲染；子代理在其后追加子代理前缀）。
  subagentSystemPrompt: string
  // 按角色技能白名单渲染子代理系统提示词（undefined = 不限制，继承父会话技能集）。
  renderSubagentSystemPrompt?: (allowedSkills: string[] | undefined) => string
  // 父会话模型（子代理沿用）。
  model: Model
  // 父会话沙箱策略（继承至子代理）。
  sandboxPolicy?: SandboxPolicy
  // 会话级子代理池（跨轮次复用 Agent 实例）。
  subagentPool?: SubagentPool
  // 子代理权限门控（复用父 permissionManager.gate；协作模式按子代理配置绑定，不继承主 agent）。
  beforeToolCall: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>
  // 子代理工具结果收尾（重复调用提醒附加；与主代理一致）。
  afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<AfterToolCallResult | undefined>
  // 子代理 PreToolUse hook（与主代理一致；可阻断并注入审计消息）。
  preToolUse?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<ToolHookResult | undefined>
  // 子代理 PostToolUse hook（与主代理一致；仅注入审计消息）。
  postToolUse?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<ToolHookResult | undefined>
  // 记录子代理内部工具调用（parent_call_id 指向触发它的父 task 调用行；与父 turn 同事务落库）。
  recordChildCall: (parentToolCallId: string, child: ChildCallInput) => void
  // 可选当前会话 ID
  getSessionId?: () => string | null
  // 可选当前会话 cwd（Subagent hook 的 LX_CWD）。
  getCwd?: () => string | undefined
  // 会话级子代理设置快照（角色目录 / 默认模型 / 并发上限）。
  subagentSettings?: SubagentSettings
  // 会话级并发槽位（缺省：每个工厂实例独立一个，行为与旧版一致）。
  subagentRuntime?: SubagentRuntime
  // 当前嵌套深度（根会话为 0；用于决定是否注入嵌套 task 与是否允许并发排队）。
  depth?: number
  // 角色模型解析器（默认复用 modelFactory.resolveModelSelection）。
  resolveModelSelection?: (selection: ModelSelection) => { model: Model } | { error: string }
}

// task 工具基础描述（角色目录与并发治理在装配时追加）。
const BASE_DESCRIPTION =
  "Delegate independent sub-tasks to sub-agents that run their own tool loop in isolated contexts and return their final text. " +
  "Single-task mode (description + prompt) runs one sub-agent; batch mode (tasks array) fans out multiple NEW sub-agents in PARALLEL and returns their results in input order. " +
  "Use batch mode when a task decomposes into 3+ independent units: shard per item (one item per file/component/question), never split a fan-out across turns, and never batch sequential chains (step B needs step A's output) or tasks that require parent context decisions. " +
  "Use single-task mode with subagent_id to continue an existing sub-agent instead of spawning new ones."

// 批量扇出单项结果（含未启动项）。
type BatchItemOutcome =
  | { kind: "result"; request: SubagentRunRequest; result: SubagentRunResult }
  | { kind: "rejected"; request: SubagentRunRequest }
  | { kind: "aborted"; request: SubagentRunRequest }

// 并发拒绝文案（单一/批量共用）。
const concurrencyMessage = (runtime: SubagentRuntime): string =>
  `Concurrency limit reached: ${runtime.active}/${runtime.limit} subagents running. Reuse an existing subagent (subagent_id) or wait for one to finish before spawning more.`

// 生成子代理唯一 id。
const generateSubagentId = (): string =>
  `subagent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// 纯文本工具结果。
const textResult = (text: string): AgentToolResult<SubagentDetails> => ({
  content: [{ type: "text", text }],
})

// onUpdate 全量快照节流：100ms 合并推送 + 结束强制 flush（内部步骤捕获不受影响）。
const createSnapshotThrottle = (
  flush: () => void,
): { schedule: () => void; flushNow: () => void } => {
  let lastSnapshotAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending = false
  const runFlush = (): void => {
    pending = false
    lastSnapshotAt = Date.now()
    flush()
  }
  return {
    schedule: () => {
      pending = true
      const elapsed = Date.now() - lastSnapshotAt
      if (elapsed >= SNAPSHOT_THROTTLE_MS) {
        if (timer) {
          clearTimeout(timer)
          timer = undefined
        }
        runFlush()
        return
      }
      timer ??= setTimeout(() => {
        timer = undefined
        if (pending) runFlush()
      }, SNAPSHOT_THROTTLE_MS - elapsed)
      timer.unref?.()
    },
    flushNow: () => {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      if (pending) runFlush()
    },
  }
}

/**
 * 创建 task 工具：委托独立子任务到进程内嵌套 Agent。
 *
 * 单任务模式复用已有子代理或新建；批量模式一次扇出多个新子代理并行执行，
 * 顶层会话超出并发上限按 FIFO 排队，嵌套子代理 fail-fast（避免父子互等死锁）。
 */
export const createTaskTool = (
  deps: TaskToolDeps & { getTools: () => AgentTool<any>[] },
): AgentTool<typeof TASK_INPUT_SCHEMA> => {
  const settings = deps.subagentSettings ?? DEFAULT_SUBAGENT_SETTINGS
  const roles = resolveAgentRoles(settings)
  const runtime = deps.subagentRuntime ?? new SubagentRuntime(settings.maxConcurrent)
  // 仅顶层会话允许排队：嵌套子代理占着槽位等待子代理会形成循环等待。
  const isTopLevel = (deps.depth ?? 0) === 0
  const concurrencyNote = settings.maxConcurrent
    ? `\n\nConcurrency: at most ${settings.maxConcurrent} subagents may run at the same time. Tasks dispatched from the top-level session beyond this limit are queued (FIFO); nested sub-agents beyond the limit are rejected immediately.`
    : ""

  // runner 依赖：注入工具集读取与嵌套 task 工厂（工厂回调避免 runner → task 循环依赖）。
  const runnerDeps: SubagentRunnerDeps = {
    ...deps,
    createNestedTaskTool: ({ systemPrompt, model, depth, getTools }) =>
      createTaskTool({
        ...deps,
        subagentSystemPrompt: systemPrompt,
        model,
        depth,
        subagentRuntime: runtime,
        getTools,
      }),
  }

  // 单任务模式：解析续接/角色 → 占槽 → 运行 → 有界回传（行为与旧版一致）。
  const executeSingle = async (
    toolCallId: string,
    params: TaskInput,
    signal: AbortSignal | undefined,
    onUpdate: ((update: AgentToolResult<SubagentDetails>) => void) | undefined,
  ): Promise<AgentToolResult<SubagentDetails>> => {
    // 1. 优先通过 subagent_id 或 name 寻址解析已有子代理
    const lookupKey = params.subagent_id?.trim() || params.name?.trim()
    const existingManaged = lookupKey ? deps.subagentPool?.resolve(lookupKey) : undefined

    // 2. 确定真实的 subagentId（复用已有 id 或为新子代理分配唯一 id）
    const subagentId =
      existingManaged?.subagentId ?? params.subagent_id?.trim() ?? generateSubagentId()

    // 3. 角色解析：续接角色不可变；新建按 agent_type > 默认子代理。
    const requestedType = params.agent_type?.trim()
    let role: ResolvedAgentRole | undefined
    if (existingManaged) {
      const existingRoleName = existingManaged.roleName
      if (requestedType && requestedType !== existingRoleName) {
        return textResult(
          `agent_type cannot be changed when resuming subagent "${subagentId}" (role: ${existingRoleName ?? "default"}). Existing subagents keep their role for their lifetime.`,
        )
      }
      role = existingRoleName ? roles.get(existingRoleName) : undefined
    } else if (requestedType) {
      role = roles.get(requestedType)
      if (!role) {
        return textResult(
          `Unknown agent_type "${requestedType}". Available agent types: ${[...roles.keys()].join(", ")}.`,
        )
      }
    }

    const roleName = role?.name ?? existingManaged?.roleName

    // 展示名回退顺序：显式 name → 池内旧名 → 角色名 → "task"。
    const subagentName = params.name?.trim() || existingManaged?.name || roleName || "task"

    // 4. 并发槽位：所有早退校验之后占用；空闲时同步获取（保持既有启动时机），满则顶层排队、嵌套拒绝。
    const lease =
      runtime.tryAcquireLease() ?? (await runtime.acquire({ queue: isTopLevel, signal }))
    if (!lease) {
      return textResult(
        signal?.aborted
          ? `Subagent execution was aborted before start.\n\n[Subagent ID: ${subagentId}]`
          : concurrencyMessage(runtime),
      )
    }

    try {
      // onUpdate 快照节流：最后一条合并快照在完成后强制 flush。
      let latestSnapshot: SubagentData | undefined
      let pendingProgress: TextContent | undefined
      const throttle = createSnapshotThrottle(() => {
        if (!onUpdate || !latestSnapshot) return
        const progress = pendingProgress
        pendingProgress = undefined
        onUpdate({ content: progress ? [progress] : [], details: { subagent: latestSnapshot } })
      })

      const result = await runSubagent(
        runnerDeps,
        {
          toolCallId,
          subagentId,
          description: params.description ?? "",
          prompt: params.prompt ?? "",
          name: subagentName,
          ...(role ? { role } : {}),
          ...(roleName ? { roleName } : {}),
          ...(existingManaged ? { existing: existingManaged } : {}),
          depth: deps.depth ?? 0,
        },
        signal,
        (snapshot, progress) => {
          latestSnapshot = snapshot()
          if (progress) pendingProgress = progress
          throttle.schedule()
        },
      )
      throttle.flushNow()

      // 槽位占用前/启动前中止：runner 不返回快照，回传取消结果。
      if (!result.data) {
        return textResult(
          `Subagent execution was aborted before start.\n\n[Subagent ID: ${subagentId}]`,
        )
      }

      let content: string
      if (result.text) {
        content = `${result.text}\n\n[Subagent ID: ${subagentId}]`
      } else if (result.error) {
        content = `Subagent execution failed: ${result.error}\n\n[Subagent ID: ${subagentId}]`
      } else {
        content = `(Subagent produced no text output)\n\n[Subagent ID: ${subagentId}]`
      }
      return { content: [{ type: "text", text: content }], details: { subagent: result.data } }
    } finally {
      lease()
    }
  }

  // 批量扇出模式：全量前置校验 → 逐项占槽并发运行 → 按输入顺序聚合文本与快照。
  const executeBatch = async (
    toolCallId: string,
    items: NonNullable<TaskInput["tasks"]>,
    signal: AbortSignal | undefined,
    onUpdate: ((update: AgentToolResult<SubagentDetails>) => void) | undefined,
  ): Promise<AgentToolResult<SubagentDetails>> => {
    // 1. 前置校验：任一角色非法整批早退（不消费槽位与流）。
    const requests: SubagentRunRequest[] = []
    for (const [index, item] of items.entries()) {
      const requestedType = item.agent_type?.trim()
      let role: ResolvedAgentRole | undefined
      if (requestedType) {
        role = roles.get(requestedType)
        if (!role) {
          return textResult(
            `Unknown agent_type "${requestedType}" in tasks[${index}]. Available agent types: ${[...roles.keys()].join(", ")}.`,
          )
        }
      }
      requests.push({
        toolCallId,
        subagentId: generateSubagentId(),
        description: item.description,
        prompt: item.prompt,
        name: item.name?.trim() || role?.name || "task",
        ...(role ? { role } : {}),
        ...(role ? { roleName: role.name } : {}),
        depth: deps.depth ?? 0,
      })
    }

    // 2. 并发扇出：逐项占槽（顶层 FIFO 排队），完成后按输入顺序聚合。
    const snapshotBuilders: Array<(() => SubagentData) | undefined> = new Array(requests.length)
    const throttle = createSnapshotThrottle(() => {
      if (!onUpdate) return
      const snapshots = snapshotBuilders.flatMap((build) => (build ? [build()] : []))
      onUpdate({ content: [], details: { subagents: snapshots } })
    })

    const outcomes = await Promise.all(
      requests.map(async (request, index): Promise<BatchItemOutcome> => {
        const lease =
          runtime.tryAcquireLease() ?? (await runtime.acquire({ queue: isTopLevel, signal }))
        if (!lease) {
          return signal?.aborted ? { kind: "aborted", request } : { kind: "rejected", request }
        }
        try {
          const result = await runSubagent(runnerDeps, request, signal, (snapshot) => {
            snapshotBuilders[index] = snapshot
            throttle.schedule()
          })
          return { kind: "result", request, result }
        } finally {
          lease()
        }
      }),
    )
    throttle.flushNow()

    // 3. 文本按输入顺序聚合；details 只含实际启动项的完整快照。
    const sections: string[] = []
    const snapshotData: SubagentData[] = []
    for (const [index, outcome] of outcomes.entries()) {
      const { request } = outcome
      const roleSuffix = request.roleName ? ` (${request.roleName})` : ""
      const label = `[${index + 1}/${outcomes.length}] ${request.name}${roleSuffix}`
      if (outcome.kind === "rejected") {
        sections.push(`${label} - rejected\n${concurrencyMessage(runtime)}`)
        continue
      }
      if (outcome.kind === "aborted") {
        sections.push(`${label} - aborted\nSubagent execution was aborted before start.`)
        continue
      }
      const { result } = outcome
      const body = result.text
        ? result.text
        : result.error
          ? `Subagent execution failed: ${result.error}`
          : result.status === "aborted"
            ? "Subagent execution was aborted."
            : "(Subagent produced no text output)"
      if (result.data) snapshotData.push(result.data)
      sections.push(`${label} - ${result.status}\n${body}\n[Subagent ID: ${request.subagentId}]`)
    }

    return {
      content: [{ type: "text", text: sections.join("\n\n") }],
      details: snapshotData.length > 0 ? { subagents: snapshotData } : {},
    }
  }

  return {
    name: "task",
    label: "Subagent",
    description: `${BASE_DESCRIPTION}\n\n${buildAgentTypesDescription(roles.values())}${concurrencyNote}`,
    inputSchema: TASK_INPUT_SCHEMA,
    execute: async (toolCallId, params, signal, onUpdate) => {
      if (params.tasks !== undefined && params.tasks.length > 0) {
        return executeBatch(toolCallId, params.tasks, signal, onUpdate)
      }
      return executeSingle(toolCallId, params, signal, onUpdate)
    },
  }
}
