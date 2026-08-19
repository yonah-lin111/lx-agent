// Markdown 模板命令可用范围：global = 全局可用（普通文档正文及 &&& 模板块内），template = 仅 &&& 模板块内。
export type MarkdownCommandScope = "global" | "template"

// Markdown 模板命令条目（由 promptTemplateLoader 扫描自 ~/.lx/command/agentMD 与 <cwd>/.lx/command/agentMD）。
export interface MarkdownTemplateCommandItem {
  name: string
  description: string
  content: string
  scope: MarkdownCommandScope
  source: "project" | "user"
  filePath: string
}

// Markdown 领域 preload API 契约：模板块标题生成与自定义斜杠命令列表。
export interface MarkdownApi {
  markdown: {
    // 用配置的 titleSummary 模型为模板块内容生成标题；失败/无模型返回 null。
    generateTemplateTitle: (content: string) => Promise<string | null>
    // 加载可用 Markdown 自定义模板命令列表。
    listMarkdownCommands: (cwd?: string) => Promise<MarkdownTemplateCommandItem[]>
  }
}
