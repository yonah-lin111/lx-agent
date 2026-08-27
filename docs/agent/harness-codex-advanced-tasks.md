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
  - 在 `src/main/agent/shell/headTailBuffer.ts` 中实现对称容量分配（默认 50/50，最大 1MiB 可配置）。
  - 支持 `pushChunk`、`totalBytes`、`retainedBytes`、`omittedBytes`、`toBytes`、`toStringWithOmissionMarker` 与 `pushBuffer` 合并。
  - 超限时中间丢弃并插入 `\n... ${omittedBytes} bytes omitted ...\n` 标记。
- [ ] **Task 11.2: UnifiedExecManager 统一生命周期与进程调度管理**
  - 在 `src/main/agent/shell/unifiedExecManager.ts` 中实现统一进程管理：
    - 支持 PID 递增分配与预留、yieldTimeMs 范围钳位（250ms ~ 30,000ms）。
    - 统一短时命令（`execCommand`）与交互式标准输入交互（`writeStdin`）。
    - 统一接入 AbortSignal 取消与退出码/失败原因捕获。
  - 重构 `src/main/agent/tools/bash.ts` 与 `src/main/agent/jobs/jobRegistry.ts`，委托 `UnifiedExecManager` 处理进程生命周期与 HeadTailBuffer 缓冲。
- [ ] **Task 11.3: 单元测试验证**
  - 编写 `test/main/agent/shell/headTailBuffer.test.ts` 与 `test/main/agent/shell/unifiedExecManager.test.ts`。

---

### Phase 12: 多级 Approval Policy 引擎与会话级白名单升级
- [ ] **Task 12.1: ApprovalPolicy 契约扩展**
  - 在 `src/shared/contracts/agent.ts` 中定义 `ApprovalPolicy = "never" | "on_request" | "unless_trusted"` 与 `ApprovalDecision` 决策契约。
  - 在 `AgentSettings` 与 `PermissionSettings` 中增加 `approvalPolicy` 配置字段（默认 `unless_trusted`）。
- [ ] **Task 12.2: PermissionManager 审批升级与会话白名单机制**
  - 在 `src/main/agent/permissions/permissionManager.ts` 中强化决策管道：
    - Plan Mode 硬阻断 -> Read-Only 沙箱硬阻断 -> Deny Rules 拦截 -> Session 白名单（工具/前缀/路径）放行 -> Allow Rules -> ApprovalPolicy 评估。
    - 支持 `approve_once`（单次放行）、`approve_session`（会话级工具放行）及 `approve_prefix`（命令前缀放行）。
- [ ] **Task 12.3: 单元测试验证**
  - 编写 `test/main/agent/permissions/approvalPolicy.test.ts`，覆盖各策略组合与白名单升级。

---

### Phase 13: Guardian 规则防护网与四维风险评估
- [ ] **Task 13.1: Guardian 四维风险评估器**
  - 在 `src/main/agent/guard/guardianEvaluator.ts` 中实现四维安全规则引擎：
    1. Data Exfiltration（数据外发：检测敏感文件、凭据、Token 外发与未授权网络上传）
    2. Credential Probing（凭据刺探：检测对 SSH、AWS 凭据、Keychain、浏览器 Cookie 的嗅探）
    3. Persistent Security Weakening（持久化降权：检测修改 hosts、sudoers、禁用安全配置、全局 chmod 777）
    4. Destructive Actions（破坏性操作：检测广义 rm -rf、高危 git reset/push 破坏、变量污染如 HOME 覆盖）
  - 输出结构化评估（`riskLevel`、`userAuthorization`、`outcome`、`category`、`rationale`）。
- [ ] **Task 13.2: 强制拦截与审批兜底升级**
  - 在 `PermissionManager.gate` 中集成 Guardian 评估：
    - Plan Mode 下高危操作直接硬阻断拒绝。
    - Default Mode 下高危操作强制绕过 `never`/`unless_trusted` 自动放行，强制升级为用户确认。
- [ ] **Task 13.3: 单元测试验证**
  - 编写 `test/main/agent/guard/guardianEvaluator.test.ts`。

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
