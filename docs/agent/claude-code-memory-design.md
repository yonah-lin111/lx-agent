# Claude Code 风格记忆（Memory）系统架构与工具设计

## 1. 背景与目标

将当前 Agent 的记忆管理全面对齐 Claude Code 的机制：
1. **去标注化**：彻底移除输出文本中的记忆引用语法（如 `[^mem:...]`）及前端 UI/Markdown 渲染器中相关的样式与 Tooltip 解析。
2. **工具化提取与召回**：将记忆的查看、保存与检索封装为与 `read`/`write` 同级的一等公民工具 `memory`（支持 `view`, `save`, `search`）。
3. **两层存储架构（Index + Topic Notes）**：
   - 项目级存储：`.lx/memory/`
   - `MEMORY.md` 索引文件：单行摘要，初始加载限制为前 200 行或 25KB，常驻上下文提示词。
   - `notes/*.md` 独立专题文件：包含 YAML frontmatter（`name`, `description`, `type`），由 Agent 在需要时通过 `memory` 工具按需召回和更新。

---

## 2. 存储规范与数据模型

### 2.1 目录结构
```text
<project-root>/.lx/memory/
├── MEMORY.md            # 高密度索引文件（One line per entry）
└── notes/               # 按需创建的 Topic Notes
    ├── user_preferences.md
    ├── feedback_debugging.md
    └── architecture_decisions.md
```

### 2.2 MEMORY.md 格式规范
```markdown
# Project Memory Index

- [user_preferences.md](notes/user_preferences.md): Prefer concise answers and strict TypeScript strict mode
- [feedback_debugging.md](notes/feedback_debugging.md): Unit tests must run using vitest in node environment
```

### 2.3 Topic Note 文件规范
```markdown
---
name: User Preferences
description: User communication style and coding preference
type: user
---

## Communication
- Prefer concise answers
- Always use simplified Chinese for responses

## Coding
- Strict TypeScript
```

记忆类型（`type`）包括：
- `user`: 用户角色、背景与工作习惯。
- `feedback`: 历史纠偏、架构或测试教训。
- `project`: 无法从现有代码直接推导的项目关键决策或上下文。
- `reference`: 外部文档、环境配置或关键线索。

---

## 3. Tool 设计：`memory`

`memory` 工具与 `read`/`write`/`edit` 处于同级地位，注册于 `ToolRegistry`。

### 3.1 Schema 定义
```typescript
z.discriminatedUnion("action", [
  z.object({
    action: z.literal("view"),
    path: z.string().optional().describe("Relative path to note file (e.g. notes/user.md), or omit to view MEMORY.md index"),
  }),
  z.object({
    action: z.literal("save"),
    topic: z.string().describe("Topic identifier or file name under notes/ (e.g. user_preferences)"),
    name: z.string().describe("Human readable title of the memory topic"),
    description: z.string().describe("Brief description of this memory topic for indexing"),
    type: z.enum(["user", "feedback", "project", "reference"]).default("project"),
    content: z.string().describe("Detailed markdown content for this topic note"),
  }),
  z.object({
    action: z.literal("search"),
    query: z.string().describe("Search keywords to search across memory index and topic notes"),
  }),
  z.object({
    action: z.literal("delete"),
    topic: z.string().optional().describe("Topic identifier to delete"),
    path: z.string().optional().describe("Relative path to the note file to delete"),
  }),
])
```

---

## 4. 系统提示词（System Prompt）对齐

在 `systemPromptManager.ts` / `memoryManager.ts` 中：
1. 提取 `.lx/memory/MEMORY.md`（上限 200 行 / 25KB）注入 `<auto_memory>` 块中。
2. 指导 Agent 主动维护长期记忆：
   - 当遇到用户明确偏好、踩坑纠偏或重大架构决策时，调用 `memory` 工具（`action: "save"`）保存。
   - 当需要深入了解某条索引条目时，调用 `memory` 工具（`action: "view"`）读取具体笔记。
   - 严禁在输出文本中附加任何自定义的引用语法（如 `[^mem:...]`）。

---

## 5. 前端与存储层清理

1. **Renderer 渲染清理**：
   - 移除 `src/renderer/src/components/ui/LxMarkdown/utils/markdownRenderer.ts` 中的 `markdown-memory-citation` 解析规则。
   - 移除 `src/renderer/src/features/markdown/utils/markdownRenderer.ts` 中的 `markdown_memory_citation` 解析。
   - 移除 `src/renderer/src/components/ui/LxMarkdown/LxMarkdownPreview.tsx` 中挂载 `markdown-memory-citation` 的 Tooltip 逻辑。
2. **TurnStore 清理**：
   - 移除 `src/main/agent/turnStore.ts` 中调用 `parseMemoryCitation` 的逻辑。
