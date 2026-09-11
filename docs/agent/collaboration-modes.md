# 协作模式（Plan / Review）

LX Agent 定义四态协作模式：`build`（执行）、`plan`（规划）、`review`（审查）、`design`（前端设计）。本文档定义 **Plan / Review** 两态的提示词契约、运行时门禁、输出协议解析与交互卡片闭环；`design` 见 [front-design.md](./front-design.md)，工具级门禁细节见 [permissions.md](./permissions.md)。

架构总览见 [architecture.md](./architecture.md)；提示词装配见 [tools.md](./tools.md) §3。

---

## 1. 模式切换与提示词装配

- **切换入口**：`Shift + Tab` 在 `build → plan → review → design → build` 循环；状态栏 `CollaborationModeButton` 同步展示；卡片一键采纳会定向切回 `build`。
- **契约**：`CollaborationMode = "build" | "plan" | "review" | "design"`；历史会话中的 `"default"` 由 `normalizeCollaborationMode` 归一化为 `"build"`。
- **提示词**：`SystemPromptManager` 的 COLLABORATION_MODE 段（order 380）按模式返回对应英文指令模板；Plan / Review 模板中明确声明「模式不因用户语气或祈使句改变」与「写入工具被禁用」。
- **运行时门禁**：Plan / Review 下 `write` / `edit` / `apply_patch` / `todowrite` 由 `PermissionManager` 直接 deny，模型收到带模式说明的错误结果并以对应 XML 协议输出（见 permissions.md §2）。

---

## 2. Plan Mode

### 2.1 提示词契约（3 阶段 + Decision Complete）

1. **PHASE 1 — Ground in the environment**：先用只读工具（`read` / `grep` / `find` / `lsp` 等）探查事实，消除未知；不了解环境前不得提问。
2. **PHASE 2 — Intent chat**：针对代码无法发现的产品诉求、约束与权衡向用户确认。
3. **PHASE 3 — Implementation chat**：细化技术方案、接口、数据流、边界与测试策略，直到计划 **decision complete**（实施者无需再做任何决策）。
4. **Finalization**：计划就绪后必须包裹在 `<proposed_plan>` 中输出；`todowrite` 在计划期被禁用；不允许用「是否需要我开始实现？」代替动作，由用户在卡片上操作。

### 2.2 输出协议

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

### 2.3 解析与交互卡片

- **解析**：`utils.ts` 的 `parseTextWithProposedPlan()` 按 `<proposed_plan>` 标签将助手文本拆分为 `kind: "proposedPlan"` 块与普通文本块；标题经 `extractPlanTitle()` 提取；流式未闭合时以 `isStreaming: true` 容错输出部分卡片。
- **数据结构**：`ProposedPlanData { title?, content, raw, isStreaming? }`。
- **`ProposedPlanCard`**：
  - 卡片渲染标题、折叠/展开的计划正文、Markdown 预览；样式基于 `--color-theme-*` Token。
  - **[采纳并执行]**：`acceptAndExecutePlan` → `setCollaborationMode("build")` → 自动发送固定指令 `Plan approved. Proceed with implementation step-by-step using todowrite.`；卡片随后进入只读态，防止重复提交。
  - **[复制计划]**：复制完整 Markdown 到剪贴板并 Toast 反馈。
- **执行面板**：对应 `ExecutionStepKind = "proposedPlan"`；消息流与 FlowList 共用同一卡片组件。

---

## 3. Review Mode

### 3.1 提示词契约（4 维审查 Rubric）

1. **Defects & Correctness**：逻辑缺陷、边界条件、off-by-one、竞态、未捕获异常、空值解引用、数据丢失风险。
2. **Security Vulnerabilities**：注入、命令执行、路径穿越、认证/授权绕过、不安全反序列化、密钥泄露。
3. **Performance & Bottlenecks**：意外的二次方扫描、无界内存增长、热路径阻塞操作。
4. **Taste & Minimalism**：过度设计、死代码、多余抽象层、违背最小修改原则。

审查模式严格只读：`write` / `edit` / `apply_patch` / `todowrite` 被硬拦截，不允许在审查中直接修复。

### 3.2 输出协议

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

### 3.3 解析与交互卡片

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

## 4. 共享解析与渲染

- `utils.ts` 的 `parseTextWithProposedPlan()` 是统一标签提取器：同一段助手文本中按出现顺序识别 `<review_findings>` / `<proposed_plan>` / `<front_design>` / `<front_design_update>`，拆成结构化块与普通文本块，支持标签未闭合的流式容错与多个块级联解析。
- 结构化块同时驱动 `AgentMessageList`（聊天流卡片）与 `AgentExecutionFlowList`（执行步骤），两处复用同一卡片组件。

## 5. 国际化命名空间

| 命名空间 | 用途 |
| :--- | :--- |
| `agent.collaborationModeBuild` / `collaborationModePlan` / `collaborationModeReview` / `collaborationModeDesign` | 状态栏模式名与切换提示 |
| `agent.plan.*` | 计划卡片：`cardTitle` / `acceptAndExecute` / `planAccepted` / `copyPlan` / `copySuccess` |
| `agent.review.*` | 审查卡片：`badge` / `applyFixes` / `fillInput` / `noFindings` / `selectedCount` 等 |

全部文案经 `useTranslation` 输出，禁止硬编码与原生 `title` 属性。
