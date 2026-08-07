import type React from "react"

import { LxMarkdownEditor } from "@/components/ui/LxMarkdown"

// 示例 Markdown 内容。
const SAMPLE_MARKDOWN = `# 示例文档

## 基础语法

- **加粗** 与 *斜体*
- \`行内代码\`
- [超链接](https://example.com)

## 代码块

\`\`\`ts
export const add = (a: number, b: number): number => a + b
\`\`\`

## 表格

| 名称 | 说明 |
| --- | --- |
| LxMarkdown | 编辑器与预览 |
| LxTag | 通用标签 |
`

/**
 * 预览 LxMarkdown 组件。
 */
export const LxMarkdownDemo = (): React.JSX.Element => (
  <div className="flex h-[520px] flex-col">
    <LxMarkdownEditor initialContent={SAMPLE_MARKDOWN} showLineNumbers showFolding />
  </div>
)
