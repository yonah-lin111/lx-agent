# 自定义子代理角色 Harness 任务清单

> **执行原则**：
> 1. 严格按单个 Task 独立执行，严禁一次性全量执行。
> 2. 每个 Task 需在 `.worktrees/` 下新建 Git 工作区执行（本轮统一工作区 `.worktrees/feat-subagent-roles`，分支 `feat/subagent-roles`，基于 `dev`）。
> 3. Task 完成后执行单域验证并向用户汇报，征询用户同意后方可合并并推进下一 Task。
> 4. 全部 Task 完成后提交代码；测试命令：`pnpm rebuild:native:node && pnpm vitest run <路径>`，类型检查 `pnpm typecheck`，Lint `pnpm lint`。

---

## 任务拆解与状态

- [x] **Task 1: 契约与 settingsService 读写接线**
  - **目标**：定义 `SubagentRoleConfig` / `SubagentSettings` / `DEFAULT_SUBAGENT_SETTINGS`；实现 `getSubagentSettings` / `saveSubagentSettings`（归一化、校验、原子写盘、保留 `agent` 其他字段）；打通 channel / handler / preload / renderer API 四层。
  - **涉及文件**：
    - `src/shared/settings.ts`、`src/shared/ipc/settingsChannels.ts`
    - `src/main/services/settingsService.ts`、`src/main/ipc/settingsHandlers.ts`
    - `src/preload/index.ts`、`src/renderer/src/features/settings/api/settingsApi.ts`
    - `test/main/services/subagentSettingsService.test.ts`（新增）
  - **验证指标**：
    - 合法配置读回一致；非法角色名 / 空 description / 保留名 / 越界 maxDepth / 越界 maxConcurrent 按设计拒绝或告警忽略。
    - 写盘后 `~/.lx/config.json` 中 `agent.hooks` / `agent.permissions` 等其他字段原样保留。
    - `pnpm vitest run test/main/services/subagentSettingsService.test.ts` 全绿。

- [x] **Task 2: 内置角色目录与解析器**
  - **目标**：新建 `agentRoles.ts`，落地 `review` / `explorer` / `worker` 三个内置角色（英文提示词，`review` 复用 `REVIEW_AGENT_SYSTEM_PROMPT`）；实现 `resolveAgentRoles` 合并与 `buildAgentTypesDescription`；导出保留名与名称正则供校验复用。
  - **涉及文件**：
    - `src/main/agent/subagent/agentRoles.ts`（新增）
    - `src/main/agent/subagent/reviewAgent.ts`（如仅导出复用则不动）
    - `test/main/agent/subagent/agentRoles.test.ts`（新增）
  - **验证指标**：
    - 内置三角色字段完整（description 非空、explorer 白名单精确匹配设计、worker/review 工具缺省）。
    - 用户角色正确合并；保留名冲突被屏蔽/忽略；描述文本格式与设计 §2.3 一致。
    - `pnpm vitest run test/main/agent/subagent/agentRoles.test.ts` 全绿。

- [x] **Task 3: task 工具角色派发**
  - **目标**：`TASK_INPUT_SCHEMA` 增加 `agent_type`；registry 装配时向工具 description 注入角色目录与并发提示；实现角色解析（显式 → 遗留 review 别名 → 默认）、未知角色报错、指令追加、模型优先级与降级、工具白名单交集（不可新增）、续接角色不可变；`SubagentStart/Stop` payload 使用解析后角色名。
  - **涉及文件**：
    - `src/main/agent/tools/task.ts`
    - `src/main/agent/assembly.ts`、`src/main/agent/sessionRunner.ts`
    - `src/main/agent/subagent/subagentPool.ts`（条目增加 `roleName`）
    - `test/main/agent/tools/task.test.ts`（扩展）
  - **验证指标**：
    - `agent_type` 命中内置/用户角色时，子代理系统提示词含角色 instructions，模型与工具集符合角色定义。
    - 未知 `agent_type` 返回错误且列出可用角色；不静默回退。
    - 角色白名单对未激活工具、`task`、MCP 工具均不产生新增能力。
    - 续接时携带不同 `agent_type` 报错，不携带或相同则沿用创建时角色。
    - `pnpm vitest run test/main/agent/tools/task.test.ts` 全绿，现有用例不回归。

- [x] **Task 4: 并发与深度治理**
  - **目标**：新建会话级 `SubagentRuntime`（acquire/release、缺省不限）；`task` 接入并发失败快返与 `finally` 释放；实现 `maxDepth` 嵌套语义（深度绑定 task 注入、白名单排除 task 时不注入）。
  - **涉及文件**：
    - `src/main/agent/subagent/subagentRuntime.ts`（新增）
    - `src/main/agent/tools/task.ts`、`src/main/agent/sessionRunner.ts`
    - `test/main/agent/subagent/subagentRuntime.test.ts`（新增）
    - `test/main/agent/tools/task.test.ts`（扩展嵌套与并发用例）
  - **验证指标**：
    - `maxConcurrent` 缺省行为与现状一致；超限时返回并发错误文案，且错误路径不泄漏槽位（连续调用可继续成功）。
    - `maxDepth = 1` 时子代理工具集不含 `task`（现状不回归）；`maxDepth = 2` 时子代理可派生孙代理且深度正确。
    - 中止/异常路径槽位正确释放。
    - 相关测试全绿。

- [x] **Task 5: 设置页「子代理」分区**
  - **目标**：新增 `subagents` 分区与 `SubagentSettings.tsx`：全局治理卡片、内置角色只读列表、用户角色增删改（`LxModal` + `SettingsActionBar`）、名称/描述/工具/数值校验与错误提示；全部文案接入 zh/en i18n；样式使用 CSS Token。
  - **涉及文件**：
    - `src/renderer/src/features/settings/components/SubagentSettings.tsx`（新增）
    - `src/renderer/src/features/settings/constants.ts`、`src/renderer/src/pages/settings/index.tsx`
    - `src/renderer/src/i18n/locales/zh.ts`、`en.ts`
    - `test/renderer/features/settings/SubagentSettings.test.tsx`（新增）
  - **验证指标**：
    - 内置角色只读展示且无编辑/删除入口；用户角色增删改保存载荷与契约一致。
    - 保留名/格式/重名即时校验并阻止保存；越界数值提示。
    - 组件测试全绿，页面无硬编码中文。

- [x] **Task 6: 文档更新与收尾验证**
  - **目标**：更新 `docs/agent/tools.md`（task 工具行与角色说明）、`docs/agent/architecture.md`（模块树补充 subagent 文件）、`docs/agent/runtime.md` §5（角色/并发/深度语义）；将本设计文档与任务文档随特性落库；执行受影响范围回归。
  - **涉及文件**：
    - `docs/agent/tools.md`、`docs/agent/architecture.md`、`docs/agent/runtime.md`
    - `docs/agent/subagent-roles-harness-design.md`、`docs/agent/subagent-roles-harness-task.md`
  - **验证指标**：
    - `pnpm typecheck` 通过；`pnpm vitest run test/main/agent test/main/services test/renderer/features/settings` 受影响域全绿；`pnpm lint` 无新增错误。
    - 文档描述与实现一致（字段、默认值、错误语义、遗留 review 别名）。
    - 全量验证由编排器在文档更新完成后统一执行（`pnpm typecheck` / `pnpm vitest` / `pnpm lint`），此处不预置结果。
