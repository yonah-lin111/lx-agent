# Codex 能力对齐增强设计

参照 [codex-main](https://github.com/openai/codex)（OpenAI Codex CLI，Rust harness）的 harness 子系统与系统提示词，分析 LX Agent 的能力差距并设计补齐方案。

> 决策记录（2026-08-24 与用户确认）：8 项候选全选、三期推进、P3 仅提示手动合并、持久 shell 升级 bash 工具、提示词单一通用层。

## 1. 差距分析总表

lx-agent 已有能力（codex 对应位点）：compaction（`core/src/compact.rs`）、权限门控（`tools/approvals.rs`）、todowrite（`update_plan`）、后台 jobs（`unified_exec` 后台语义）、根级 AGENTS.md 注入（`agents_md.rs`）、MCP / skills / LSP / question / subagent / web_search / webfetch、worktree 列表展示与切换（`switchWorktree` channel）。

| # | 候选 | codex 位点 | lx-agent 现状 | 本期 |
|---|------|-----------|--------------|------|
| 1 | 系统提示词通用行为层 | `protocol/src/prompts/base_instructions/default.md`、`core/gpt_5_codex_prompt.md` | 默认提示词仅身份+工具用法（assembly.ts `DEFAULT_SYSTEM_PROMPT`） | **P1** |
| 3 | 环境上下文注入 | `core/src/context/environment_context.rs` | 无 | **P1**（并入 1） |
| 4 | 嵌套 AGENTS.md | `docs/agents_md.md` spec、`agents_md_manager.rs` | 仅读 cwd 根单个文件（instructionLoader.ts） | **P1** |
| 2 | 持久 shell 会话 | `core/src/unified_exec/`、`shell_snapshot.rs` | bash 一次性进程（tools/bash.ts） | **P2** |
| 8 | apply_patch 多文件补丁 | `core/src/apply_patch.rs` | edit/write 单文件（tools/edit.ts、write.ts） | **P2** |
| 7 | worktree-per-task | `core/src/worktree_trust*` 及桌面端工作流 | 只能切换单个绑定 worktree_path，无创建 | 放弃/跳过 |
| 5 | Turn 级聚合 diff | `core/src/turn_diff_tracker.rs` | 仅单工具 diff | 附录 |
| 6 | Review 评审模式 | `core/src/tasks/review.rs`、`prompts/templates/review/rubric.md` | 无 | 附录 |

远期池（本期不做）：worktree-per-task（按需保留手动切换能力）、memories（跨会话记忆）、hooks（用户配置钩子）、collab（多代理角色）、code-mode（JS 编排）、sandboxing（seatbelt/namespace 隔离）、goals（目标追踪）、shell snapshots、file-search 模糊查找。

## 2. P1：系统提示词通用行为层 + 嵌套 AGENTS.md

### 2.1 提示词通用行为层（#1 + #3）

从 codex 两份提示词中**只提炼模型无关的行为规范**（其 GPT 系变体是私有调优，不移植），在 `createDefaultSystemPromptManager()`（prompts/systemPromptManager.ts）注册新 section `behavior`，order 位于 IDENTITY(-100) 之后、既有指令层之前：

- **preamble 规范**：工具调用前用 1–2 句说明即将做什么；相关动作合并一条；琐碎单次读取不必。
- **plan 准则**：简单任务（约最易的 1/4）跳过 todowrite；不出单步计划；完成子任务后即时更新状态而非重复全文。
- **验证哲学**：先跑与改动最相关的定向验证（lint/单测），再逐步放宽；格式化迭代最多 3 次；无关坏测试不顺手修，只在结论中提及。
- **dirty worktree 安全条款**：绝不 revert 非自己做出的更改；禁止 `git reset --hard` / `git checkout --` 等破坏性命令除非用户明确要求；发现非预期的意外更改时停下询问。
- **最终消息规范**：默认极简；实质改动先一句结论再展开；文件引用带起始行号 `path:line` 可点击；结尾给自然的下一步建议（无则不给）。
- **编辑约束**：注释克制、最小修改、不过度抽象。

环境上下文（#3）注册为新 context `environment`，模板渲染 `<env>` 块：`cwd`、`platform`、日期、git 分支与仓库根。同步收集（`execSync`，短超时，失败静默跳过对应行），经 `AssembleContext.variables` 注入，不引入异步化改造。

位点：`src/main/agent/prompts/systemPromptManager.ts`（新增常量文本 + 注册）、`src/main/agent/assembly.ts`（env 变量收集函数）。测试扩展 `test/main/agent/prompts/systemPromptManager.test.ts`。

### 2.2 嵌套 AGENTS.md（#4）

对齐 codex spec：AGENTS.md 作用域 = 所在目录整个子树，更深层优先。

- `instructionLoader.ts` 扩展：解析仓库根（`git rev-parse --show-toplevel`，非 git 目录回退 cwd），注入 **cwd → 仓库根沿途所有 AGENTS.md**，按根→cwd 排序拼接（深层靠后生效），每段保留现有 `Instructions from: <path>` 头；CLAUDE.md 兼容逻辑维持现状（仅根级 fallback）。
- 子目录 AGENTS.md 不由 harness 自动注入：在 2.1 行为层声明规范——触碰某子目录文件前应检查该子树的 AGENTS.md（模型经 `read` 自取）。这与 codex 运行时行为一致（根+CWD 链注入，其余靠提示词引导）。

## 3. P2：工具层升级

### 3.1 bash 持久会话（#2）

`tools/bash.ts` 参数扩展：`{ command; timeout?; background?; session?: string }`。

- `session` 省略 = 现行为（一次性 spawn），零破坏；提供 = 复用或创建同名的持久 PTY 会话。
- 新模块 `src/main/agent/shell/persistentShell.ts`：`Map<sessionKey, PersistentSession>`；node-pty（依赖已有，terminalService.ts 在用）spawn 用户 `$SHELL`；分隔符协议（写 echo marker）判定命令结束与退出码；输出增量缓冲，沿用 truncate/spill 上限（DEFAULT_MAX_LINES/BYTES）。
- 会话键 `${sessionId}:${session}`：随 agent 会话 abort/reset 清理；空闲超时（默认 10min）回收；`app will-quit` 全量销毁。
- 校验：`background` 与 `session` 互斥（INVALID_ARGS error toolResult 回灌）；同 session 命令天然串行（PTY 单输入流）。
- 门控不变：bash 已在门控集，session 内 cd 不影响门控判定（门控发生在工具调用层，与会话内状态解耦）。
- details 附 `session` 名供 UI 展示；getToolCategoryMeta 无需改动。

### 3.2 apply_patch 工具（#8)

新内置工具 `apply_patch`：`{ patch: string }`，V4A 格式（`*** Begin Patch` / `*** Add File|Update File|Delete File` / `@@` hunks，对齐 codex `apply_patch.rs`）。

- **多文件原子性**：先全量校验（Add 目标不存在、Update/Delete 目标存在且每个 hunk 上下文唯一命中），任一失败整体拒绝并回灌错误，不产生部分写入。
- 复用 `file-mutation-queue` 串行化、`diff.ts` 结构化 diff（toolResult.diff 现有渲染零改动）、edit 后 LSP 诊断。
- 与 edit/write 并存：ALL_TOOL_NAMES 注册 + assembly.ts 装配；行为层提示词引导「跨多文件的结构化修改优先 apply_patch，单点小改 edit/write 即可」。
- 解析器独立成纯函数模块（`tools/applyPatchParser.ts`），便于单测覆盖畸形输入。

## 4. 风险与回滚

| 期 | 风险 | 缓解/回滚 |
|----|------|----------|
| P1 | 行为层改变所有会话的模型行为 | section 独立注册，删一行即回滚；env 收集失败静默降级；systemPromptManager.test 先行锁定输出形状 |
| P2 | PTY 会话进程泄漏 | 空闲回收 + 会话级清理 + quit 兜底 disposeAll；apply_patch 解析器纯函数全覆盖单测（畸形 patch 必拒） |

## 5. 验证策略

每期完成后仅做受影响范围校验：`typecheck` + 定向单测（P1 提示词装配快照；P2 persistentShell 生命周期与 applyPatchParser 用例）。UI 交互由用户启动项目实测（项目约定 agent 不跑应用）。
