# Plan Mode (<proposed_plan>) 协议与执行门禁设计方案

## 1. 架构目标与背景

参考 OpenAI Codex (`codex-rs`) 的协作模式 Harness 与提示词架构，在 LX Agent 中建立从 **计划制定（Plan Mode）** 到 **执行实施（Default Mode）** 的确定性状态机与协议门禁，彻底解决 Agent 在计划阶段误写代码、缺乏结构化计划交付物、无法一键转执行的痛点。

```mermaid
flowchart TD
    subgraph Plan Mode [Plan Mode: 严禁副作用]
        P1[Phase 1: 环境探查<br/>只读搜索与代码分析] --> P2[Phase 2: 意图澄清<br/>高价值边界与决策确认]
        P2 --> P3[Phase 3: 实现方案<br/>接口/时序/数据流/测试]
        P3 --> PlanOut["输出 &lt;proposed_plan&gt; 计划块"]
    end

    subgraph Security Gatekeeper [运行时硬阻断]
        PlanOut -.-> Perm["PermissionManager<br/>阻断 write / edit / apply_patch / todowrite"]
    end

    subgraph Renderer Presentation [前端交互卡片]
        PlanOut --> Parser["AST / Tag Extractor<br/>提取 ProposedPlanBlock"]
        Parser --> Card["ProposedPlanCard 独立卡片<br/>展示标题、摘要、实施步骤与测试计划"]
    end

    subgraph Execution Transition [状态机流转]
        Card -->|点击 [采纳并执行]| Trans["1. IPC setCollaborationMode('default')<br/>2. 自动发送执行指令 Prompt"]
        Trans --> Exec["Default Mode 启动<br/>使用 todowrite 编排并执行修改"]
    end
```

---

## 2. 核心协议与数据流设计

### 2.1 提示词分层规范 (`src/main/agent/prompts/systemPromptManager.ts`)
在 `harness:collaboration-mode` 中针对 `plan` 模式注入对齐 Codex 规范的 3 阶段指令（全英文提示词）：
1. **Phase 1: Ground in the environment**：先通过只读工具（`read`, `grep`, `find`, `lsp`）探查事实，严禁在不了解环境时提问。
2. **Phase 2: Intent chat**：针对无法通过代码探查发现的产品诉求与权衡点进行确认。
3. **Phase 3: Implementation chat**：细化架构、数据流、边界与测试用例，做到 **Decision Complete**（实施者无需做额外决策）。
4. **Finalization Rule**：当计划就绪，严格输出 `<proposed_plan>` 块：
   ```text
   <proposed_plan>
   # [Plan Title]
   ## Summary
   ...
   ## Key Changes
   ...
   ## Test Plan
   ...
   ## Assumptions
   ...
   </proposed_plan>
   ```
5. **禁用工具声明**：显式声明禁止调用 mutating tools，且 `todowrite` 仅在执行期可用，计划期严禁调用。

### 2.2 运行时硬门禁 (`src/main/agent/permissions/permissionManager.ts`)
在 `collaborationMode === "plan"` 时，底层安全规则执行硬阻断（Deny）：
- **工具拦截**：`write`、`edit`、`apply_patch`、`todowrite` 直接返回 `deny`。
- **Bash 拦截**：任何带有写文件或危险重写参数的命令由 `CommandSafetyGuard` 与 `GuardianEvaluator` 在 Plan 模式下直接判定为 `deny`。

### 2.3 消息块类型与解析契约 (`src/renderer/src/features/agent/types.ts` & `executionFlow.ts`)
在前端消息流中引入 `ProposedPlanBlock` 一等公民块：

```typescript
export interface ProposedPlanData {
  title: string
  content: string
  raw: string
  status: "pending" | "accepted" | "superseded"
}

export type ChatBlock =
  | { kind: "text"; text: string; durationMs?: number }
  | { kind: "thinking"; thinking: string; durationMs?: number }
  | { kind: "toolCall"; toolCall: ToolCall; toolResult?: ToolResultMessage }
  | { kind: "proposedPlan"; plan: ProposedPlanData; timestamp: number }
```

### 2.4 前端交互卡片 (`ProposedPlanCard.tsx`)
- **视觉风格**：采用 CSS Token (`--color-theme-*`) 渲染高质感卡片，包含清晰的计划图标、标题、折叠/展开预览、测试计划摘要。
- **操作栏**：
  - **[采纳并执行]**（主按钮）：触发原子流转。
  - **[复制计划]**：将完整 Markdown 计划复制到剪贴板。
- **状态流转时序**：
  1. 调用 `window.api.agent.setCollaborationMode(tabId, "default")`。
  2. 触发 `sendMessage` 发送预置英文提示词：`"Plan approved. Proceed with implementation step-by-step using todowrite."`。
  3. 卡片状态置为 `accepted`，防止重复提交。

---

## 3. 国际化规范
所有 UI 文案均接入 `useTranslation`：
- `agent.plan.cardTitle`: "拟定实施计划" / "Proposed Implementation Plan"
- `agent.plan.acceptAndExecute`: "采纳并执行" / "Accept & Implement"
- `agent.plan.planAccepted`: "已采纳执行" / "Plan Accepted"
- `agent.plan.copyPlan`: "复制计划" / "Copy Plan"
- `agent.plan.copySuccess`: "计划已复制到剪贴板" / "Plan copied to clipboard"
