# RepoMap 仓库结构地图 任务拆解

> 设计：`docs/feature/repo-map/design.md`
> 工作区：`.worktrees/feat-repo-map`（分支 `feat/repo-map`，从 `dev` 切出）→ 完成后询问是否合并
> 说明：本文件按 grill 1-7 决策编写；代码与测试全部在工作区提交，文档在 `dev` 提交。

## 阶段 0：工作区准备

### T0 创建 git 工作区

- **步骤**
  1. `git worktree add .worktrees/feat-repo-map -b feat/repo-map dev`
  2. 工作区内执行 `node scripts/setupWorktreeNodeModules.mjs`（链接主仓库 `node_modules`）。
- **期望**：工作区独立可跑测试与构建；主工作区 `dev` 仅保留 `docs/feature/repo-map/` 两份文档提交。

## 阶段 1：wasm 资产与依赖

### T1 vendor wasm

- **步骤**
  1. 从 `web-tree-sitter@0.25.10` 取 `tree-sitter.wasm`；从 `tree-sitter-wasms@0.1.13` 取 `tree-sitter-typescript|tsx|javascript|python.wasm`。
  2. 落盘 `resources/repomap/`（5 个文件，约 8MB）。
- **期望**：`ls resources/repomap` 五件套齐全；不引入 `tree-sitter-wasms` 运行时依赖。

### T2 依赖声明

- **步骤**
  1. `package.json` dependencies 增加 `"web-tree-sitter": "0.25.10"` 并安装。
- **期望**：主进程构建 external 通过；类型可用。

## 阶段 2：管线模块（`src/main/agent/repoMap/`）

### T3 契约与基础设施

- **步骤**
  1. `types.ts` / `paths.ts` / `tokenize.ts` / `queries.ts`。
- **期望**：`resolveRepoMapAssetsDir()` 在测试态返回仓库 `resources/repomap`。

### T4 解析与提取

- **步骤**
  1. `parser.ts`（`initParser({ wasmDir? })`、语言/查询缓存）。
  2. `symbolExtractor.ts`（`extractTags` 批处理）。
  3. `gitFiles.ts`（`git ls-files` + 目录遍历回退）。
- **期望**：对 fixture 目录可提取 def/ref 标签；不支持语言返回 null 不抛错。

### T5 图与排序

- **步骤**
  1. `graph.ts`（IDF 加权引用图）、`pagerank.ts`（`rankFiles(graph, focusFiles)`）。
- **期望**：被多文件引用的文件排名高于孤立文件；focus 提升生效。

### T6 渲染与缓存

- **步骤**
  1. `renderer.ts`（token 预算内输出文件+签名）。
  2. `cache.ts`（`getAppDataRoot()/cache/repomap/<sha256(root)>.json`；mtime+size 失效；renderer 结果按 mapHash 缓存）。
  3. `index.ts`（`buildRepoMap` 编排、`invalidateCache`、`getCacheStats`）。
- **期望**：同参数二次调用 `cacheHit: true`；文件变更后哈希失效重建。

### T7 会话快照

- **步骤**
  1. `snapshot.ts`：`getRepoMapSnapshot(cwd)` / `primeRepoMapSnapshot(cwd)` / `clearRepoMapSnapshots()`；1024 token、5s 超时、失败 60s 冷却；TTL 5 分钟 stale-while-revalidate。
- **期望**：miss 时返回 null 并后台构建；构建完成后同步读命中；测试可注入时钟与构建函数。

## 阶段 3：工具与激活链

### T8 repo_map 工具

- **步骤**
  1. `src/main/agent/tools/repoMap.ts`：zod 输入（`max_tokens` clamp 256-8192、`focus_files`、`focus_symbols`），只读、parallel。
- **期望**：工具单测可注入构建函数，输出摘要+地图，失败返回可读文案。

### T9 注册与权限组

- **步骤**
  1. `assembly.ts`：注册 `createRepoMapTool(cwd)`、`ALL_TOOL_NAMES` 加 `"repo_map"`。
  2. `capabilityService.ts`：`DEFAULT_TOOLS` 加 `"repo_map"`（默认能力快照激活）。
  3. `src/shared/settings.ts`：`SUBAGENT_PERMISSION_TOOL_NAMES` 加 `"repo_map"`。
  4. `permissions/rule.ts` `EXEMPT_TOOLS`、`compaction/contextPruner.ts` `DEFAULT_PRUNABLE_TOOLS`、`subagent/agentRoles.ts` explorer 白名单同步登记（只读语义一致性）。
  5. `sessionRunner.send()` 首轮装配前 `await primeRepoMapSnapshot(cwd)`（有界超时，TTL 复用）。
- **期望**：build/plan/review 激活且可用；minimal 不激活；子代理默认工具集包含；首个请求即注入地图。

## 阶段 4：提示词注入

### T10 section 注入

- **步骤**
  1. `systemPromptManager.ts`：`REPO_MAP="agent:repo-map"`、order 260；`literal` section 读快照（miss 触发后台 prime）。
  2. 注入格式 `<repo_map>` XML 块（说明行 + 地图）。
- **期望**：快照存在则出现在系统提示词与装配面板；不存在返回空串不阻塞；TTL 过期后台重建。

## 阶段 5：渲染层

### T11 Active Tools 分类

- **步骤**
  1. `BUILTIN_UNDERSCORE_TOOLS` 加 `"repo_map"`。
- **期望**：Active Tools 面板分类为 Tool 而非 MCP；`AgentPage.tsx` 零改动。

## 阶段 6：测试与校验

### T12 测试

- **步骤**
  1. `test/main/agent/repoMap/` 覆盖：tokenize、graph、pagerank、renderer、cache、gitFiles、symbolExtractor（fixture TS/JS/Python）、index（端到端+缓存+focus）、snapshot（TTL/冷却/去重/超时）。
  2. `test/main/agent/tools/repoMap.test.ts` 工具契约；`test/main/agent/prompts/repoMapSection.test.ts` 注入契约。
  3. 受影响既有测试同步更新（`capabilityService`/`agentRunner`/`agentRoles` 工具列表断言）。
- **期望**：新增用例全绿；既有受影响用例更新后全绿。

### T13 精确校验

- **步骤**
  1. `pnpm vitest run <受影响文件>`；`pnpm typecheck`；`pnpm exec biome check --write <变更文件> --linter-enabled=false`；`pnpm exec electron-vite build` 验证打包解析。
- **期望**：类型与格式零错误；构建通过；不做全量验证。

## 阶段 7：提交与合并

### T14 提交

- **步骤**
  1. 工作区提交 `feat(repo-map): ...`。
- **期望**：分支 `feat/repo-map` 只含本次相关文件。

### T15 合并询问

- **步骤**
  1. 汇总验证结果，询问用户是否合并回 `dev`。
- **期望**：用户确认后 `git merge --no-ff`，移除工作区与分支；未确认则保留工作区。
