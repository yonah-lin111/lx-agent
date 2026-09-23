// 模板块能力出口：源码构建、正文规范化、id 注入与名称后缀（设置页与文档编辑器共用）。
export {
  buildAgentBlockSource,
  extractAgentBlockBody,
  injectCustomTemplateBlockIds,
  isInsideMarkdownTemplateBlock,
  normalizeAgentBlockBody,
  stripMarkdownBlockNameSuffix,
  withMarkdownBlockNameSuffix,
} from "@/features/markdown/commands/markdownBlockCommands"
export { agentBlockPreviewExtensions } from "@/features/markdown/extensions/markdownAgentBlockPreview"
export { LxMarkdownEditor } from "@/features/markdown/LxMarkdownEditor"
export { LxMarkdownPreview } from "@/features/markdown/LxMarkdownPreview"
