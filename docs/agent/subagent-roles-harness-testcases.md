# 自定义子代理角色 Harness 测试用例

**前置说明：**

- 环境/配置：`~/.lx/config.json` → `agent.subagents`（`roles` / `maxConcurrent` / `maxDepth` / `defaultModel`）；推荐通过 设置 → 子代理 可视化编辑，手改配置用于容错用例。
- 生效时机：配置保存后**仅对新会话生效**；运行中会话沿用装配时的角色目录快照。
- 观察位置：设置页「子代理」分区、Agent 执行流程面板（`task` 调用参数、子代理卡片、PromptAssembly）、主进程 console（`[subagents]` / `console.warn` 降级日志）、`~/.lx/config.json`。

---

## 组 1：设置页角色 CRUD 与落盘

- **提示词**：打开 设置 → 子代理，新增角色 `auditor`（描述、指令、模型覆盖、工具白名单 `read` + `grep`），保存。
- **验证步骤**：检查设置页列表与内置角色只读区；检查配置文件。

  ```jsonc
  // ~/.lx/config.json 期望出现
  "agent": { "subagents": { "roles": { "auditor": {
    "description": "...", "instructions": "...",
    "model": { "provider": "...", "model": "..." },
    "tools": ["read", "grep"]
  } } } }
  ```

- **期望**：保存成功；`auditor` 出现在自定义角色列表且可再次编辑/删除；内置 `review` / `explorer` / `worker` 只读、无编辑/删除入口；重名、保留名、非法名称、空描述在弹窗内即时拦截并提示。

## 组 2：`task` 工具按 `agent_type` 派发自定义角色

- **提示词**：`用 auditor 角色审计 src/main/agent/tools/task.ts 的边界处理`
- **验证步骤**：执行后打开执行流程面板，展开 `task` 调用与子代理卡片；检查子代理系统提示词与工具集。
- **期望**：`task` 入参出现 `agent_type: "auditor"`；子代理提示词 = 父提示词 → 子代理后缀 → auditor instructions；子代理可用工具仅为 `read`、`grep`（白名单未含的工具在子代理内不可见）；结果正常回传。

## 组 3：未知 `agent_type` 显式报错

- **提示词**：`用 reviewer-xyz 角色帮我审计一下最近的改动`
- **验证步骤**：观察 `task` 工具结果文本。
- **期望**：返回 `Unknown agent_type "reviewer-xyz". Available agent types: review, explorer, worker, …`；不静默回退默认子代理；不产生子代理 turn（无子代理卡片、无模型调用）。

## 组 4：内置 `explorer` 只读边界

- **提示词**：`并行派两个 explorer 分别调查 Agent 工具注册流程和权限门控流程`
- **验证步骤**：展开两个子代理卡片，检查其工具集与实际调用。
- **期望**：两个 explorer 并行运行；工具仅 `read` / `ls` / `grep` / `find` / `lsp` / `web_search` / `webfetch` / `time`；不出现 `write` / `edit` / `apply_patch` / `bash`；输出引用具体文件与行号。

## 组 5：内置 `review` 与遗留别名

- **提示词**：`派 review-agent 审查当前 worktree 的未提交 diff`
- **验证步骤**：检查子代理系统提示词与最终输出格式。
- **期望**：未传 `agent_type` 时 `name` 含 `review` 仍映射内置 `review`（仅新建生效）；提示词包含四维 Rubric 且追加于子代理后缀之后；输出 Summary / Findings（含 `file:line`）/ Taste & Architecture Notes / Residual Risks。

## 组 6：角色模型覆盖与降级

- **提示词**：`用 auditor 角色检查这一处实现`
- **验证步骤**：分别配置 ①有效模型 ②`provider/model` 不存在的模型，观察子代理模型标识与主进程日志。
- **期望**：①子代理使用 `role.model`；②`console.warn` 提示解析失败并降级到 `defaultModel`，再降级到父会话模型；子代理照常运行不报错。续接同一子代理时模型保持创建时的解析结果。

## 组 7：并发上限 fail-fast

- **提示词**：配置 `maxConcurrent: 1` 后，`同时派两个 task 分别统计 src/main 与 src/renderer 的文件数`
- **验证步骤**：观察第二个 `task` 的返回文本与整体耗时。

  ```jsonc
  "subagents": { "maxConcurrent": 1, "roles": {} }
  ```

- **期望**：第二个 `task` 立即返回 `Concurrency limit reached: 1/1 subagents running. Reuse an existing subagent (subagent_id) or wait for one to finish before spawning more.`；不排队、不长时间阻塞、无父子互等死锁；第一个完成后再次派发可成功。清空 `maxConcurrent` 后恢复不限并发。

## 组 8：`maxDepth` 嵌套治理

- **提示词**：分别配置 `maxDepth: 1` 与 `maxDepth: 2`，让子代理尝试继续派发孙代理。
- **验证步骤**：检查子代理可用工具中是否存在 `task`，以及 `task` 工具描述是否含角色目录。

  ```jsonc
  "subagents": { "maxDepth": 2 }
  ```

- **期望**：`maxDepth: 1`（默认）子代理工具集无 `task`；`maxDepth: 2` 子代理可派生孙代理（孙代理深度 2 后不可再派生）；深度越界时 `task` 直接不存在而非报错；角色 `tools` 白名单不含 `task` 时即使深度允许也不注入。

## 组 9：续接角色不可变

- **提示词**：先 `派一个 worker 实现 X`，拿到 Subagent ID 后再输入 `继续用 explorer 角色处理刚才的子任务（subagent_id: …）`
- **验证步骤**：观察第二次 `task` 的返回文本与子代理面板。
- **期望**：第二次调用返回 `agent_type cannot be changed when resuming subagent "<id>" (role: worker). Existing subagents keep their role for their lifetime.`；原子代理角色、上下文不变；不带 `agent_type` 续接时正常保留上下文继续执行。

## 组 10：生效时机（新会话生效）

- **提示词**：在一个运行中的会话里修改/新增角色，然后不新建会话直接派发 `agent_type: "新角色"`；再新建会话重复一次。
- **验证步骤**：对比新旧会话 `task` 工具描述（Available agent types 列表）与派发结果。
- **期望**：运行中会话沿用旧目录（新角色未知报错、已删角色仍可用）；新建会话使用最新目录；保存时 Toast 与设置页无报错。

## 组 11：配置容错与保存校验

- **提示词**：手改 `~/.lx/config.json` 注入非法配置后重启应用；再在设置页输入非法值尝试保存。

  ```jsonc
  "roles": { "BadName": {...}, "review": {...}, "ok": { "description": "" } },
  "maxDepth": 9, "maxConcurrent": 0
  ```

- **验证步骤**：观察启动日志与会话可用性；观察设置页报错。
- **期望**：读取时逐条 `console.warn`（`[subagents] …`）并忽略非法角色/越界值（`maxDepth` 回退 1、`maxConcurrent` 忽略），会话正常启动不阻断；设置页保存保留名/非法名/空描述/`maxDepth` 越界（不在 1–5）/`maxConcurrent` 越界（不在 1–32）被阻止并提示，主进程二次校验同样拒绝。

## 组 12：权限不提升（安全不变量）

- **提示词**：自定义角色 `tools: ["bash"]`，在 `read-only` 沙箱或默认权限模式下用该角色执行 `bash` 写文件命令。
- **验证步骤**：观察是否触发父权限门控（审批弹窗/拒绝），以及角色能否绕过 Deny 规则与沙箱。
- **期望**：子代理工具调用仍经父 `permissionManager.gate`；`read-only` 沙箱下写操作被硬拦截；审批、Deny 规则、Guardian 与主代理一致；角色配置无法新增父会话未激活的工具（含 MCP）。

## 组 13：角色目录与并发提示注入

- **提示词**：新建会话后查看 `task` 工具描述；配置 `maxConcurrent: 4` 后再次新建会话对比。
- **验证步骤**：经执行流程面板 PromptAssembly 或 `getPromptAssembly` 检查工具定义。
- **期望**：描述包含 `Available agent types:` 且逐条列出内置 + 自定义角色（内置顺序 review → explorer → worker）；配置并发上限时追加 `Concurrency: at most 4 subagents may run at the same time. …`；未配置时无该行。

---

## 附：补充说明

- 已知限制：多行角色描述在工具描述中折叠为单行；`tools` 白名单为「与父激活集求交集」，未激活的 MCP/内置工具名静默缺失（不报错）；运行中会话不做热重载。
- 自动化覆盖：`test/main/services/subagentSettingsService.test.ts`（配置归一/校验/写盘）、`test/main/agent/subagent/agentRoles.test.ts`（角色目录/合并/描述）、`test/main/agent/subagent/subagentRuntime.test.ts`（并发槽位）、`test/main/agent/tools/task.test.ts`（派发/降级/续接/深度）、`test/renderer/features/settings/SubagentSettings.test.tsx`（设置页 CRUD/校验/保存载荷）。
- 回归命令：`pnpm vitest run test/main/agent/tools/task.test.ts test/main/agent/subagent/agentRoles.test.ts test/main/agent/subagent/subagentRuntime.test.ts test/main/services/subagentSettingsService.test.ts test/renderer/features/settings/SubagentSettings.test.tsx`；全量 `pnpm test` 需对照 dev 基线（既有 18 文件 / 67 用例失败与本次改动无关）。
