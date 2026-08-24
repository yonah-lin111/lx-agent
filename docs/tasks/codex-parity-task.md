# Codex 能力对齐增强任务

设计依据：[codex-parity-enhancement.md](../specs/codex-parity-enhancement.md)。两期推进，每期独立可交付、可单独合并。

## 执行流程约束

- 每期在 `.worktrees/` 新建 git 工作区执行：`git worktree add .worktrees/codex-parity-p<N> -b agent/codex-parity-p<N>`。
- 任务在工作区内完成并自验后，向用户展示变更总览，**询问是否合并回 dev**，未经确认不合并。
- 每期验收：受影响范围 `typecheck` + 定向单测通过；无遗留旧导入/重复 DTO/channel。

## P1：提示词与指令体系（已完成并合并至 dev）

- [x] T1.1 行为层 section：`prompts/systemPromptManager.ts` 的 `createDefaultSystemPromptManager()` 注册 `behavior` 段（order 介于 IDENTITY 与既有指令层之间），内容 = 设计 §2.1 六条规范；PROMPT_SECTION_NAMES 增常量。
- [x] T1.2 环境上下文：assembly.ts 增加同步 env 收集（cwd/platform/date/git 分支+仓库根，短超时静默失败），注册 `environment` context 渲染 `<env>` 块。
- [x] T1.3 单测先行/同步更新 `test/main/agent/prompts/systemPromptManager.test.ts`：锁定新段顺序与 `<env>` 形状。
- [x] T1.4 instructionLoader 嵌套注入：cwd→仓库根沿途 AGENTS.md 全量拼接（根→深层排序），保留来源头；非 git 回退 cwd 根现状。
- [x] T1.5 行为层追加嵌套 AGENTS.md 规范声明（触碰子目录文件前检查该子树）。
- [x] T1.6 更新 `docs/agent/tools.md` §5（instruction 加载）与 runtime 文档相关段落。

## P2：工具层（已完成并合并至 dev）

- [x] T2.1 `tools/applyPatchParser.ts` 纯函数模块：V4A patch 解析 + 全量预校验（Add 不存在 / Update·Delete 存在 / hunk 上下文唯一命中）；畸形输入单测覆盖。
- [x] T2.2 `tools/applyPatch.ts` 工具：原子落盘（校验全过才写）、复用 file-mutation-queue / diff.ts 结构化 diff / 写后 LSP 诊断。
- [x] T2.3 装配：ALL_TOOL_NAMES + assembly.ts createRegistry 注册 + 行为层补「多文件修改优先 apply_patch」引导句。
- [x] T2.4 `shell/persistentShell.ts`：node-pty 会话池（`${sessionId}:${session}` 键）、marker 协议判定命令结束与退出码、增量缓冲 + truncate/spill 上限、空闲 10min 回收、abort/reset/quit 清理。
- [x] T2.5 bash 工具扩展 `session?` 参数：省略走原路径；`background` 互斥校验；details 附 session 名。
- [x] T2.6 persistentShell 生命周期单测 + bash 兼容回归（无 session 参数行为不变）。

## 附录：待排期（本期不实施）

- worktree-per-task（#7）：按需保留既有手动切换能力。
- Turn 聚合 diff（#5）：turn_diff_tracker 思路，runner 侧聚合本轮 toolResult.diff。
- Review 模式（#6）：/review 内置模板 + rubric 提示词层。
