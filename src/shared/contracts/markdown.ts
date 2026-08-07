// Markdown 领域 preload API 契约：模板块标题生成。
export interface MarkdownApi {
  markdown: {
    // 用配置的 titleSummary 模型为模板块内容生成标题；失败/无模型返回 null。
    generateTemplateTitle: (content: string) => Promise<string | null>
  }
}
