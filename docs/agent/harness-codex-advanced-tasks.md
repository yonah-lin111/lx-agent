# Codex 级 Harness 与架构进阶任务分解清单 (Master Task List)

## 状态总览
- [x] Phase 1: 三档沙箱策略模型与设置持久化（Contracts & SettingsStore & PermissionManager）
- [x] Phase 2: 模型自适应与沙箱感知提示词装配（SystemPromptManager & Model Adapters）
- [x] Phase 3: 结构化多 Agent 协作通信协议（Task Tool & InterAgentCommunication）
- [x] Phase 4: 前端设置与交互状态同步（Settings View & Status Bar & 全链路单测）
- [x] Phase 5: 子代理会话池管理与长程上下文续接（Subagent Pool & Resume & 多轮追问）
- [x] Phase 6: Collaboration Mode (Default vs Plan) 契约与主进程状态机
- [x] Phase 7: Plan Mode 权限与写操作硬性阻断拦截（Non-mutating Gate）
- [x] Phase 8: Current Time Reminder 状态机与动态注入（<current_time> Injection）
- [x] Phase 9: 专精 Review Agent 子代理与 Rubric 审查能力（Rubric Evaluation）
- [x] Phase 10: 前端模式切换交互与全量单测回归
- [ ] Phase 11: Unified Exec 统一执行引擎与 HeadTailBuffer 截断缓冲区
- [ ] Phase 12: 多级 Approval Policy 引擎与会话级白名单升级机制
- [ ] Phase 13: Guardian 规则防护网与四维风险评估器 (Exfiltration/Probing/Weakening/Destruction)
- [ ] Phase 14: 分层记忆系统（Hierarchical Workspace Memories & Citations 解析与注入）
- [ ] Phase 15: 前端审批覆盖层（ApprovalOverlay）与 Memory 查看器组件
- [ ] Phase 16: 全链路回归验证与单测套件完备化

---

## 阶段细分与执行步骤

### Phase 1 ~ Phase 10 (已完成基线)
- 已完成三档沙箱模型、模型自适应装配、多代理协议、SubagentPool、Plan/Default 模式、TimeReminder 及 Review Agent 全链路实现与单测。

---

### Phase 11: Unified Exec 统一执行引擎与 HeadTailBuffer
- [ ] **Task 11.1: HeadTailBuffer 对称式截断缓冲实现**
  - 在 `src/main/agent/shell/headTailBuffer.ts` 中实现对称容量分配（默认 50/50）。
  - 超限时中间丢弃并插入 `[...N bytes omitted...]` 标记，支持 `total_bytes`、`retained_bytes` 和 `omitted_bytes`。
- [ ] **Task 11.2: UnifiedExecManager 统一生命周期管理**
  - 重构 `src/main/agent/tools/bash.ts` 与 `jobRegistry.ts`，将所有短时与长时进程统一接入 `UnifiedExecManager`。
  - 支持进程流式输出、取消信号下发与状态捕获。
- [ ] **Task 11.3: 单元测试验证**
  - 编写 `test/main/agent/shell/headTailBuffer.test.ts` 与 `unifiedExec.test.ts`。

---

### Phase 12: 多级 Approval Policy 引擎与会话级白名单升级
- [ ] **Task 12.1: ApprovalPolicy 契约扩展**
  - 在 `src/shared/contracts/agent.ts` 中定义 `ApprovalPolicy = "never" | "on_request" | "unless_trusted"`。
  - 在 `AgentSettings` 中增加 `approvalPolicy` 字段。
- [ ] **Task 12.2: PermissionManager 审批升级逻辑强化**
  - 实现 `ApprovalDecisionPayload`（`approve_once` / `approve_session` / `deny`）。
  - 会话级放行维护在当前 Session 运行态中，自动豁免后续匹配的前缀命令或路径。
- [ ] **Task 12.3: 单元测试验证**
  - 编写 `test/main/agent/permissions/approvalPolicy.test.ts`。

---

### Phase 13: Guardian 规则防护网与四维风险评估
- [ ] **Task 13.1: Guardian 策略规则与评估器**
  - 在 `src/main/agent/guard/guardianEvaluator.ts` 中实现四维安全检查：
    1. Data Exfiltration（数据外发）
    2. Credential Probing（凭据刺探）
    3. Persistent Security Weakening（持久化降权）
    4. Destructive Actions（破坏性操作）
- [ ] **Task 13.2: 拦截与前置审批联动**
  - 对 Guardian 判定为高危的操作强制升级审批，若处于 Plan 模式则直接硬拒绝。
- [ ] **Task 13.3: 单元测试验证**
  - 编写 `test/main/agent/guard/guardian.test.ts`。

---

### Phase 14: 分层记忆系统 (Hierarchical Workspace Memories)
- [ ] **Task 14.1: MemoryLoader 与 MEMORY.md 索引读取**
  - 在 `src/main/agent/memories/memoryManager.ts` 中实现工作区记忆加载器。
  - 解析 `MEMORY.md`、`rollout_summaries/` 与 `extensions/ad_hoc/notes/`。
- [ ] **Task 14.2: SystemPromptManager MEMORY_SUMMARY 注入与 Citation 解析**
  - 提示词中注入 `<memory_guidance>` 与 `MEMORY_SUMMARY` 分段。
  - 模型回复后提取 `<oai-mem-citation>` 结构并向前端事件流推送。
- [ ] **Task 14.3: 单元测试验证**
  - 编写 `test/main/agent/memories/memoryManager.test.ts`。

---

### Phase 15: 前端审批覆盖层 (ApprovalOverlay) 与交互组件
- [ ] **Task 15.1: ApprovalOverlay 弹窗组件实现**
  - 在 `src/renderer/src/features/agent/components/` 下实现审批弹窗，支持选择 Once / Session / Deny。
- [ ] **Task 15.2: 接入 i18n 与 CSS Token 主题系统**
  - 遵守项目规范，禁用原生 `title` 属性，统一使用 `LxTooltip`。
- [ ] **Task 15.3: Memory 引用标签展示组件**
  - 在助手消息底部渲染引用气泡。

---

### Phase 16: 全链路回归验证与单测套件
- [ ] **Task 16.1: 全量测试回归**
  - 执行 `pnpm test test/main/agent`，确保所有单测 100% 通过。
- [ ] **Task 16.2: 交付审查与合并准备**
  - 确认代码无多余注释，英文阻断文案标准，准备提交用户验收。
