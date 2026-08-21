# Agent 任务文档 (v14：上下文智能修剪、重复工具守卫与 Spill 桌面端交互演进)

本文是 Agent 功能继续实施的**任务文档 v14**。设计文档详见 [design-v14.md](./design-v14.md)。

---

## 阶段规划与任务清单

### 阶段一：Main 进程 RepeatToolGuard 重复工具守卫实现
- [ ] **1.1** 在 `src/main/agent/guard/repeatToolGuard.ts` 中实现参数规范化与调用指纹比对机制：
  - 深度排序 key 的规范化 JSON 序列化
  - 维护 session 级别的 WeakMap / Map 计数器
  - 阶梯拦截逻辑：3 次软提醒、5 次强提醒、7 次硬拒绝
- [ ] **1.2** 在 `src/main/agent/core/agent-loop.ts` 或 `AgentRunner` 的 `beforeToolCall` / `executePreparedToolCall` 中集成守卫检测
- [ ] **1.3** 编写针对 `repeatToolGuard` 的单元测试 `test/main/agent/guard/repeatToolGuard.test.ts`

### 阶段二：Main 进程 Tier-1 上下文智能修剪（Context Slimming / Prune）
- [ ] **2.1** 在 `src/main/agent/compaction/contextPruner.ts` 中实现非破坏性上下文修剪纯函数：
  - 识别早期历史消息中的只读类工具调用（`read`, `grep`, `find`, `ls`, `webfetch` 等）
  - 超过行数（20行）或字符阈值（500字符）的内容安全替换为占位符
  - 保留最新 N 轮对话不做修剪
- [ ] **2.2** 在 `AgentRunner` 的 `transformContext` 管道以及 `generateCompactionSummary` 预处理流程中无缝接入修剪器
- [ ] **2.3** 编写修剪器的单元测试 `test/main/agent/compaction/contextPruner.test.ts`

### 阶段三：Main & Preload & Renderer Spill 交互与国际化
- [ ] **3.1** 在 `src/main/ipc/` 或 agent runner 中确保支持安全打开/定位 Spill 文件的 IPC 接口（如 `shell.openPath` / `shell.showItemInFolder`）
- [ ] **3.2** 在 `src/renderer/src/features/agent/components/AgentToolCallBlock.tsx` 中增加溢出文件操作条：
  - 支持一键打开溢出文件
  - 美观的折叠/查看提示
- [ ] **3.3** 更新国际化多语言文件 `src/renderer/src/i18n/locales/zh.ts` 和 `en.ts`，补充所有涉及的文案词条
- [ ] **3.4** 执行受影响文件的精准类型检查与单元测试验证
