# 画布可视化检查器与 DOM 节点定向子树替换任务实施清单

## 任务概览
实现前端设计从“全量大文件重写”向“DOM 节点可视化点选 + 局部子树精准更新”的架构升级。

---

### Task 1: DOM 树合成纯函数引擎与数据提取工具
- [x] 1.1 新建 `src/renderer/src/features/agent/utils/designSynthesizer.ts`：
  - `synthesizeDesignUpdate(baseHtml, targetSelector, newFragmentHtml)`：使用 DOMParser 安全执行 `targetNode.outerHTML = newFragmentHtml` 并序列化输出。
  - `extractDesignTargetContext(html, targetSelector)`：安全检索目标节点，提取全局骨架环境（body 类名、主题）与目标节点 `outerHTML`。
  - `generateElementSelector(element)`：优先提取 `#id`、`[data-section]`，若无则挂载稳定 `data-design-id` 并生成属性选择器。
- [x] 1.2 编写专属单元测试 `test/renderer/features/agent/designSynthesizer.test.ts`：
  - 测试正常节点替换与属性保留。
  - 测试选择器未命中时的安全报错拦截（不产生破损 HTML）。
  - 测试分层上下文提取逻辑。

---

### Task 2: 协议解析、切片上下文注入与 Prompt 指令扩展
- [x] 2.1 扩展 Token 正则：在 `agentMarkdownInputUtils.ts` 中升级 `extractDesignMentions`，支持提取 `#target` 选择器。
- [x] 2.2 扩展发送端切片：在 `useAgentChat.ts` 的 `sendMessage` 中，若包含 target，调用 `extractDesignTargetContext` 生成精简的 `<referenced_design target="...">` 注入块。
- [x] 2.3 扩展接收端缝合流：
  - 在 `utils.ts` 与 `useAgentChat.ts` 中支持匹配 `<front_design_update parent_id="..." target="...">`。
  - 流式结束时自动调用 `synthesizeDesignUpdate` 完成 DOM 树拼接并向 `frontDesignStore` 注册版本快照。
  - 容灾拦截：若合成失败，弹出 `t("frontDesign.updateTargetNotFound")` Toast，不破坏历史版本。
- [x] 2.4 系统提示词更新：在 `systemPromptManager.ts` 中追加 `LOCAL COMPONENT & ELEMENT UPDATES (<front_design_update>)` 英文操作约束。

---

### Task 3: 画布检查器 (Visual Inspector) 交互开发
- [x] 3.1 国际化扩展：在 `zh.ts` 和 `en.ts` 中添加 `inspectMode`, `inspectModeDesc`, `inspectHint`, `updateTargetNotFound` 等文案。
- [x] 3.2 顶部工具栏开关：在 `FrontDesignPage.tsx` 增加 `MousePointerClick` 检查器切换按钮，带有高亮激活状态。
- [x] 3.3 Iframe 事件注入与高亮浮层：
  - 检查器激活时，向 `iframeRef.current.contentDocument` 挂载 `mousemove`、`click` 监听并拦截默认动作。
  - 动态渲染悬浮矩形边框（粉色高亮浮层）与标签名指示器。
  - 点击元素时，调用 `generateElementSelector` 获取稳定锚点，拼装 `@design:${id}#${target} (${name}) ` 注入激活 Tab 并跳转。

---

### Task 4: 完整性验证与回归单测
- [x] 4.1 编写 `FrontDesignPage.inspector.test.tsx` / `FrontDesignPage.test.tsx`：测试检查器开关切换、元素点选与 Token 回填交互。
- [x] 4.2 编写全链路集成测试：测试从 `@design:id#target` 发送、Prompt 切片提取，到 Agent 返回 `<front_design_update>` 后的 DOM 拼接与 Store 版本派生。
- [x] 4.3 执行 Biome 检查与 TypeScript 类型校验。
- [x] 4.4 执行相关测试套件，保证新增测试与现有测试 100% 通过（279/279 passed）。
