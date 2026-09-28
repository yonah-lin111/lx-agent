# 协作模式（Auto / Plan / Review / Minimal）

LX Agent 定义五态协作模式：`build`（执行）、`auto`（自动编排）、`plan`（规划）、`review`（审查）、`minimal`（极简：终端 + 读写）。本文档定义 Auto / Plan / Review / Minimal 四态的提示词契约、运行时门禁、输出协议解析与交互卡片；`build` 无特殊协议，工具级门禁细节见 [permissions.md](./permissions.md)。

架构总览见 [architecture.md](./architecture.md)；提示词装配见 [tools.md](./tools.md) §3。

---

## 1. 模式切换与提示词装配

- **切换入口**：`Shift + Tab` 在 `build → auto → plan → review → minimal → build` 循环；状态栏 `CollaborationModeButton` 同步展示（auto 下显示「Auto · 有效模式」），点击标签弹出模式列表可定向切换；**Agent 生成/执行中（`isStreaming`）禁用切换**——标签降级为纯 hover 提示（含锁定说明）、`Shift + Tab` 以 warning toast 提示运行中不可切换；输入容器与其中控件（麦克风 / 加号 / 模型选择 / 发送按钮；用量胶囊保持透明）统一按展示模式叠加模式底纹（`data-agent-mode` + `--agent-mode-*-tint`，auto 跟随有效模式、有效 build 回退 auto 色；控件底纹叠加在自身底色之上）；下拉弹层与 Tooltip 位于浮层、保持默认外观，状态栏不变色；卡片一键采纳经 `setEffectiveMode` 退出只读模式；新会话启动模式取 `agent.permissions.collaborationMode`（缺省 `build`）。
- **契约**：`CollaborationMode = "build" | "auto" | "plan" | "review" | "minimal"`；循环顺序与 `nextCollaborationMode` 由 `COLLABORATION_MODE_ORDER` 单一来源定义；`switch_mode` 可达目标由 `SWITCH_MODE_TARGETS`（build/plan/review，永久排除 minimal）定义；历史会话中的 `"default"` 与已移除的 `"design"` 由 `normalizeCollaborationMode` 归一化为 `"build"`。
- **提示词**：`SystemPromptManager` 的 COLLABORATION_MODE 段（order 380）按模式返回对应英文指令模板；Plan / Review 模板中明确声明「模式不因用户语气或祈使句改变」与「写入工具被禁用」；Minimal 走 `complete` 独占段（见 §6）。
- **历史条目**：切换模式会在会话中落一条 `mode_change` entry（`CollaborationModeSwitchMessage`，非 LLM 上下文，不注入模型；auto 编排的有效模式切换额外携带 `viaAuto: true`），执行流程列表（FlowList）以 «Mode Switched: Plan Mode» 独立步骤展示（模式标签 + «via Auto» 标签 + 职责说明、不计入对话轮次）；**会话尾部连续的切换消息（模型/模式）按同类原地合并**——来回切换只更新同一条目（entry payload 原地更新、seq 与位置不变），被真实对话消息打断后才新增条目；**用户切回本条连续切换运行开始前的基础模式（`from`）时整条撤销**——同步移除内存消息与 seq 对齐、删除对应 `mode_change` entry，`collaboration_mode_changed` 以 `removedMessage` 通知 renderer 删除该项（`viaAuto` 条目与模型切换不参与撤销；旧数据无 `from` 时退回原地合并）；草稿态（会话尚未落库）切换只更新运行时模式，不产生条目。
- **运行时门禁**：Plan / Review 下 `write` / `edit` / `apply_patch` / `todowrite` / `memory` 由 `PermissionManager` 直接 deny（`plan` 另禁 `question`——提问由内嵌 grill-me 的纯文本逐题协议承担），模型收到带模式说明的错误结果并以对应 XML 协议输出；Minimal 下仅 `bash` / `read` / `write` / `edit` 放行（`background: true` 参数拒绝），注册表激活层同步收窄（见 permissions.md §2）。
- **子代理派发**：`task` 由 `agent.permissions.modes.<mode>.subagents` 白名单控制——非 build 模式缺省仅允许内置探索子代理 `explorer`，可勾选其他或自定义角色（空数组 = 全禁）；Minimal 无 `task` 工具、不可派发；能力集含模式硬基线工具的角色（含未限制能力集）在该模式下永久禁用（设置页锁定 + 门控拒绝）；父模式硬基线经 `parentMode` 叠加到子代理的每次工具调用，派发不能绕过只读约束；模式段同时声明该限制，`task` 工具描述的 `Available agent types` 按模式裁剪（模型可见目录 = 实际可派发角色）。
- **共享解析**：`utils.ts` 的 `parseTextWithProposedPlan()` 是统一标签提取器——同一段助手文本中按出现顺序识别 `<review_findings>` / `<proposed_plan>` / `<grill_question>`，拆成结构化块与普通文本块，支持标签未闭合的流式容错与多块级联解析；结构化块同时驱动 `AgentMessageList`（聊天流卡片）与 `AgentExecutionFlowList`（执行步骤），两处复用同一卡片组件。

---

## 2. Auto Mode（自动编排）

Auto 是编排基础模式：会话的门禁 / 提示词 / 子代理白名单始终按**有效模式**（effective mode）计算，模型经 `switch_mode` 工具在 `plan / review / build` 间自行切换，`minimal` 永久不可达（切换目标与 `task` 派发参数均拒绝）。

### 2.1 双层状态模型

- **基础模式**（`host.collaborationMode`）：用户选择；状态栏弹层 / `Shift + Tab` / 设置页默认值经 `setCollaborationMode` 整体替换——切到具体模式即退出 Auto（有效模式覆盖被清除）；切回 `auto` 时有效模式重置为 `build`。
- **有效模式**（`host.effectiveMode`）：非 auto 基础模式恒等于基础模式；auto 下缺省 `build`，由 `switch_mode`（模型自决）或 `setEffectiveMode`（卡片采纳路径统一入口：base 为 auto 时只重置有效模式，否则等价于基础模式切换）更新。
- **事件与历史**：`collaboration_mode_changed` 携带 `{ mode, effectiveMode }` 与可选的 `message`（新增/合并条目）或 `removedMessage`（撤销条目）；auto 编排的有效模式切换落 `mode_change` 条目（payload `viaAuto: true`），尾部连续切换仍原地合并（合并时清除上一条的 `viaAuto` 残留）；用户基础模式切换「切回运行起点」的整条撤销不作用于 `viaAuto` 条目。
- **提示词装配**：`buildCollaborationModePrompt(base, effective)` 组合——auto 基础模式注入《Auto 编排策略》（三条判定规则，`autoModePrompt.ts`），有效模式为 plan / review 时叠加对应模式契约段；`minimal` 独占段不受影响。
- **门禁**：提示词段、工具硬基线、`task` 角色裁剪、registry 激活集全部按有效模式计算；`switch_mode` 工具仅在 auto 基础模式的激活集中出现，门控层另有防御纵深拒绝（非 auto 调用直接 deny，即便被白名单放行）。

### 2.2 切换策略（三条判定规则）

1. 默认 build 直接执行小型、清晰、低风险改动，不切模式；一次有意义的阶段变化才切一次；用户对模式的显式要求永远优先。
2. 跨多文件/模块、新功能与 API/schema/数据模型设计、需求含糊或多方案权衡、高风险不可逆操作、用户明确要计划 → 切 `plan`，走 `<proposed_plan>` 协议并结束回合等用户审批。
3. 用户要求审查/审计 → 切 `review` 输出 `<review_findings>`；实现完重大或高风险改动后，派发 `task(mode="review")` 子代理做隔离验证，把结论并入完成汇报；琐碎改动跳过自审。
4. 需要用户交互/审批的协议产物必须**内联自产**（计划卡、审查卡）；隔离探查、草稿、并行扇出走 `task` 派发（其产出只是文本工具结果，不回传卡片）。
5. 只读模式回 `build` 由模型在用户批准后自行完成（不得在展示计划的同一轮切回）；`minimal` 永久不可达；不要为小改动反复横跳。

### 2.3 `switch_mode` 工具与切换审计

- **激活**：`switch_mode` 仅在 auto 基础模式装配进激活工具集（`ALL_TOOL_NAMES` + `sessionRunnerAgentFactory` 激活收窄）；工具描述内嵌判定规则与退出约束。
- **即时性**：进入只读模式（plan / review）即时生效（当轮门控立即生效）；工具结果同步返回目标模式的契约与退出约束（系统提示词在下一轮 `ensureReady` 重建时才更新）。
- **自行退出（无宿主二次确认）**：用户批准后（点击计划/审查卡片，或在对话中明确要求继续），模型自行调用 `switch_mode("build")` 退出只读模式，即时生效并落 `mode_change` 条目（`viaAuto: true`）供审计；状态栏即时显示 `Auto · Build`，执行流程视图以独立步骤展示切换。计划/审查卡片的采纳按钮仍走 `setEffectiveMode`（用户点击直达）。
- **提示词约束**：输出 `<proposed_plan>` 的计划轮不得同轮调用 `switch_mode("build")`（用户尚未批准）；用户未批准前模型须留在当前模式等待。

### 2.4 模式子代理派发（`task` 的 `mode` 参数）

- `task`（单任务与批量 `tasks[]` 项）新增可选 `mode`（`build | plan | review`），**仅 auto 基础模式**可用；其他基础模式传参直接拒绝（不会静默忽略）。
- 子代理按该模式渲染系统提示词（`renderSubagentSystemPrompt(..., modeOverride)`，缺省缺口走 `agent.subagents.mode` 快照）并叠加模式硬基线：只读模式下子代理的写操作由父门控 deny（父模式基线以有效模式叠加）。
- **角色兼容**：`roleBlockedTools(role.permissions, childMode)` 非空时拒绝派发（单任务整单、批量整批早退）；续接子代理不接受 `mode` 变更；嵌套派发继承父模式且不再接受 `mode`（禁止嵌套编排）。
- **产出边界**：子代理输出只是文本工具结果，**不渲染协议卡片**；需要用户审批或交互的 `<proposed_plan>` / `<review_findings>` 必须由主 agent 内联切换到对应模式自行输出。

### 2.5 权限语义

- auto 基础模式无模式硬基线（与 build 同级），`DEFAULT_MODE_SUBAGENT_ROLES` 不注入子代理白名单缺省。
- `agent.permissions.modes.auto` 作为**附加收紧层**与有效模式白名单求交（只能收紧、永不放开），但不约束 `switch_mode` 本身（要禁用 auto 请切换基础模式）。
- `switch_mode` 归入 `EXEMPT_TOOLS`（纯会话状态切换，无文件/命令副作用）；切换只落审计条目，不进入权限弹窗。

---

## 3. Plan Mode

### 3.1 提示词契约（3 阶段 + 内嵌 grill-me 技能 + Decision Complete）

1. **PHASE 1 — Ground in the environment**：先用只读工具（`read` / `grep` / `find` / `lsp` 等）探查事实，消除未知；不了解环境前不得提问。
2. **PHASE 2 — Intent chat**：走内嵌 `grill-me` 技能协议，针对代码无法发现的产品诉求、约束与权衡逐题盘问。
3. **PHASE 3 — Implementation chat**：延续 grill-me 节奏细化技术方案、接口、数据流、边界与测试策略，直到计划 **decision complete**（实施者无需再做任何决策）。
4. **Finalization**：计划就绪后必须包裹在 `<proposed_plan>` 中输出；`todowrite` 在计划期被禁用；不允许用「是否需要我开始实现？」代替动作，由用户在卡片上操作。

**内嵌技能 `grill-me`**（`grillMeSkillPrompt.ts`，对齐 Matt Pocock 的 grill-me / grilling 原始契约，Plan 模式常驻生效）：

- **决策树 + 一次一问**：把方案拆成决策树，每轮只问一个当前阻塞的最高风险决策，等待回答后再问下一个；依赖尚未闭合的决策不得提前提问（depth-first）。
- **事实自己查，决策问用户**：能用只读工具从代码/配置/文档验证的事实不得反问用户，须先探查并给出 `file:line` 证据；只有代码无法回答的决策才交给用户（Facts are your job, never the user's）。
- **每题必带推荐与通俗举例**：固定字段输出 `问题: / 推荐: / 推荐举例说明:`，并整体包裹在 `<grill_question>` 标签内（标签名不翻译；`推荐举例说明` 必须用日常语言举一个具体例子让用户秒懂）；严禁调用 `question` 工具（plan 模式硬拦截，`PLAN_QUESTION_TOOL_REASON`），提问一律走该文本协议。
- **选项规范化**：离散选择必须逐行输出 `A) 文案` / `B) 文案`（题干保留在 `问题:` 行，禁止把 `(A)…(B)…` 塞进问题句子里），`推荐:` 先点名推荐选项键（如 `推荐: A——理由`）；开放式问题（数值/命名/自由描述）不输出选项行。解析为 `GrillQuestionOption[]` 后由卡片渲染为独立选项行（键位徽标 + 文案）。
- **英文提示词，随用户语言输出**：技能契约本身是英文系统提示词；三行标签随用户语言本地化（英文为 `Question: / Recommendation: / Recommendation example:`），代码标识符、路径与 API 名保持原文。
- **例外**：请求已 decision complete 或用户明确要求收敛时，不硬凑问题，直接进入 `<proposed_plan>`。

**协议解析与卡片**：`utils/structuredTags.ts` 将 `<grill_question>` 拆为 `kind: "grillQuestion"` 块（`GrillQuestionData`；字段与选项解析见 `utils/tagContentParsers.ts`，兼容中英文标签、Markdown 加粗、多行字段与全/半角选项键；定稿必须闭合，流式容忍未闭合）。聊天流以 `GrillQuestionCard` 独立渲染（sky 主题：问题 / A/B/C 选项行 / 推荐 / 推荐举例说明，右上角复制原始提问）；执行流以 `ExecutionStepKind = "grillQuestion"` 独立步骤呈现（默认展开、不参与执行折叠、顶部筛选 tab 与计数）。会话恢复与 `toAgentMessages` 回传按原始标签文本往返，协议不丢失。

### 3.2 输出协议

```xml
<proposed_plan>
# [Plan Title]

## Summary
[方案摘要]

## Key Changes
| File | Change |
|------|--------|
| `path/to/file` | [变更说明] |

## Test Plan
1. [验证步骤]

## Assumptions
- [假设]
</proposed_plan>
```

### 3.3 解析与交互卡片

- **解析**：`utils.ts` 的 `parseTextWithProposedPlan()` 按 `<proposed_plan>` 标签将助手文本拆分为 `kind: "proposedPlan"` 块与普通文本块；标题经 `extractPlanTitle()` 提取；流式未闭合时以 `isStreaming: true` 容错输出部分卡片。
- **数据结构**：`ProposedPlanData { title?, content, raw, isStreaming? }`。
- **`ProposedPlanCard`**：
  - 卡片渲染标题、折叠/展开的计划正文、Markdown 预览；样式基于 `--color-theme-*` Token。
  - **[采纳并执行]**：`acceptAndExecutePlan` → `setCollaborationMode("build")` → 自动发送固定指令 `Plan approved. Proceed with implementation step-by-step using todowrite.`；卡片随后进入只读态，防止重复提交。
  - **[复制计划]**：复制完整 Markdown 到剪贴板并 Toast 反馈。
- **执行面板**：对应 `ExecutionStepKind = "proposedPlan"`；消息流与 FlowList 共用同一卡片组件。

---

## 4. Review Mode

### 4.1 提示词契约（4 维审查 Rubric）

1. **Defects & Correctness**：逻辑缺陷、边界条件、off-by-one、竞态、未捕获异常、空值解引用、数据丢失风险。
2. **Security Vulnerabilities**：注入、命令执行、路径穿越、认证/授权绕过、不安全反序列化、密钥泄露。
3. **Performance & Bottlenecks**：意外的二次方扫描、无界内存增长、热路径阻塞操作。
4. **Taste & Minimalism**：过度设计、死代码、多余抽象层、违背最小修改原则。

审查模式严格只读：`write` / `edit` / `apply_patch` / `todowrite` / `memory` 被硬拦截（模式硬基线，见 permissions.md §2），不允许在审查中直接修复；子代理派发缺省仅限内置只读探索子代理 `explorer`，父模式基线对子代理同样生效。处于 Review 模式且用户未指定审查目标时，默认审查当前未提交变更（staged / unstaged / untracked）。代码审查的唯一路径是 Review Mode，不存在 `review` 子代理角色。

### 4.2 输出协议

```xml
<review_findings>
## Summary
[审查结论概述]

### Finding 1: [Short Title]
- **Severity**: Critical | High | Medium | Low
- **Location**: `path/to/file.ts:42` (或 `path/to/file.ts:42-50`)
- **Description**: [问题与风险说明]
- **Suggestion**: [最小化修复建议]

</review_findings>
```

无问题时同样输出空的 `<review_findings>` 块（Summary 说明未发现缺陷）。

### 4.3 解析与交互卡片

- **解析**：`parseReviewFindingsContent()` 提取 Summary 与每个 `### Finding` 块：
  - `Severity` 匹配 `Critical|High|Medium|Low`，缺失时降级 `medium`；
  - `Location` 解析 `` `file:line` `` / `file:line-line` 形态，缺失时降级 `workspace:1`；
  - `Description` / `Suggestion` 按字段提取，找不到 Description 时回退整段正文。
- **数据结构**：`ReviewFindingsData { summary, findings: ReviewFindingItem[], raw, isStreaming? }`；`ReviewFindingItem { id, title, severity, location: { filePath, lineStart, lineEnd? }, description, suggestion? }`。
- **`ReviewFindingsCard`**：
  - 严重级别徽标与计数（Critical / High / Medium / Low），默认选中可修复项，支持全选/反选。
  - 点击 `filePath:line` 经 `window.api.agent.openFileAt` 在本地 IDE 定位。
  - **[填入输入框]**：将选中 Finding 格式化为文本填入聊天输入框，由用户继续编辑；
  - **[采纳并修复选中项]**：`acceptAndExecuteReviewFixes` → 切换到 `build` → 自动发送结构化修复指令（逐条列出标题、`file:line` 与修复建议，结尾要求 `Proceed with precision and verify the fixes.`）。
- **执行面板**：对应 `ExecutionStepKind = "reviewFindings"`。

---

## 6. Minimal Mode（极简终端 + 读写）

最小工具集的轻量模式，用于测试与对比模型基础表现。**有意偏离 dsh minimal**：dsh `presets/minimal.patch.yml` 只组合 persona（`complete`）+ persistent-shell（shell-only），本实现在此之上额外开放 `read` / `write` / `edit`（文件读写有专用工具后不再依赖 shell 转义与 heredoc）：

- **工具白名单**：仅 `bash` / `read` / `write` / `edit`（fail-closed）——注册表激活层只注册/激活这四个工具，MCP、skill、子代理与其余内置工具（含 `ls` / `grep` / `find` / `apply_patch` / `todowrite` / `memory`）对模型不可见；门控层对白名单外工具直接 deny（`MODE_MUTATION_REASONS.minimal`），`bash` 的 `background: true` 参数单独拒绝（`MINIMAL_BACKGROUND_REASON`，引导改用 `command &` 或 `bash.session` 持久会话）。
- **独占提示词**：`MINIMAL_MODE_PROMPT` 以 `complete: true` 段注册（`SystemPromptManager` 的 `harness:minimal-mode`）——一句身份 + 最小工具约定（bash 负责列目录/搜索/命令，read 优先于 cat，读写走专用工具），渲染时压掉其余全部 section 与 context（不注入 AGENTS.md、MEMORY、skills、环境变量与模式段），与 dsh persona `complete: true` + `includeRuntimeContext: false` 同构；非 minimal 模式该段渲染为空、不参与压制。
- **shell 写文件**：Security Guard 对重定向（`>` / `>>`）与内容改写（tee file、sed -i、truncate）的硬拦在所有模式一致生效——写文件走 `write` / `edit`（结构化参数、经 Guardian 路径评估），`bash` 负责列目录、搜索与执行命令；破坏性指令（rm 受保护目标、mkfs、dd、git reset --hard 等）照旧绝对阻断。
- **能力配置**：`agent.permissions.modes.minimal` 只能在其白名单内再收紧（例如 `tools: []` 全禁）；设置页「Agent 模式」分区中该模式行只读展示「仅允许：bash, read, write, edit」，不提供编辑入口。
- **子代理模式**：`agent.subagents.mode` 不接受 `minimal`（子代理工具集由角色权限决定，与 Minimal 白名单语义不匹配；非法值保存拒绝、读时告警并回退 `build`）。

---

## 7. 国际化命名空间

| 命名空间 | 用途 |
| :--- | :--- |
| `agent.collaborationModeBuild` / `collaborationModeAuto` / `collaborationModePlan` / `collaborationModeReview` / `collaborationModeMinimal` | 状态栏模式名、模式列表与切换提示 |
| `agent.modeSwitchViaAuto` | FlowList 中 auto 编排切换的「Auto 编排」标签 |
| `agent.plan.*` | 计划卡片：`cardTitle` / `acceptAndExecute` / `planAccepted` / `copyPlan` / `copySuccess` |
| `agent.review.*` | 审查卡片：`badge` / `applyFixes` / `fillInput` / `noFindings` / `selectedCount` 等 |

全部文案经 `useTranslation` 输出，禁止硬编码与原生 `title` 属性；样式统一使用 `--color-theme-*` CSS Token。
