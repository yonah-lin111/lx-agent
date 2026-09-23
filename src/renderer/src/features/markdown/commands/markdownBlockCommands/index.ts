// 通用块命令能力出口：实现位于 components/ui/LxMarkdown，此处转发保持既有消费方导入路径。

export type {
  MarkdownBlockCommand,
  MarkdownBlockCommandId,
  MarkdownBlockInsertion,
  MarkdownBlockTrigger,
  MarkdownBlockTriggerKind,
} from "@/components/ui/LxMarkdown/commands/markdownBlockCommands"
export {
  createMarkdownBlockInsertion,
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
  isInsideMarkdownCodeFence,
} from "@/components/ui/LxMarkdown/commands/markdownBlockCommands"
export {
  getMarkdownSuppleBlockEndLine,
  getMarkdownTemplateBlockContent,
  getMarkdownTemplateBlockCopyText,
  getMarkdownTemplateBlockEndLine,
  getMarkdownTemplateBlockStartLine,
} from "./blockRead"
export { getMarkdownListContinuation } from "./listContinuation"
export type {
  ParsedMarkdownLogEnd,
  ParsedMarkdownSubblockStart,
  ParsedMarkdownVarTemplateEnd,
} from "./markers"
export {
  isInsideMarkdownLogBlock,
  isInsideMarkdownSuppleBlock,
  isInsideMarkdownTemplateBlock,
  isInsideMarkdownVarTemplateBlock,
  isMarkdownLogEndLine,
  isMarkdownLogStartLine,
  isMarkdownSuppleEndLine,
  isMarkdownSuppleStartLine,
  isMarkdownTemplateEndLine,
  isMarkdownTemplateStartLine,
  MARKDOWN_LOG_END_RE,
  MARKDOWN_LOG_MARKER_RE,
  MARKDOWN_LOG_START_RE,
  MARKDOWN_SUPPLE_END_RE,
  MARKDOWN_SUPPLE_START_RE,
  MARKDOWN_TEMPLATE_COMMENT_RE,
  MARKDOWN_VAR_TEMPLATE_END_RE,
  MARKDOWN_VAR_TEMPLATE_START_RE,
  parseMarkdownLogEndLine,
  parseMarkdownLogStartLine,
  parseMarkdownSuppleStartLine,
  parseMarkdownTemplateStartLine,
  parseMarkdownVarTemplateEndLine,
  toggleMarkdownTemplateCommentLines,
} from "./markers"
export {
  buildAgentBlockSource,
  createMarkdownTemplateId,
  cycleMarkdownTemplateStatus,
  extractAgentBlockBody,
  getMarkdownSuppleWorktree,
  getMarkdownTemplateIdRanges,
  getMarkdownTemplateStatus,
  getMarkdownTemplateStatuses,
  getMarkdownTemplateWorktree,
  getMarkdownTemplateWtRanges,
  injectCustomTemplateBlockIds,
  MARKDOWN_BLOCK_NAME_SUFFIX,
  MARKDOWN_TEMPLATE_STATUS_LABELS,
  MARKDOWN_TEMPLATE_STATUS_SUFFIX,
  normalizeAgentBlockBody,
  parseMarkdownSuppleEndLine,
  setMarkdownSuppleWorktree,
  setMarkdownTemplateTitle,
  setMarkdownTemplateWorktree,
  stripMarkdownBlockNameSuffix,
  withMarkdownBlockNameSuffix,
} from "./metadata"
export type {
  MarkdownListContinuation,
  MarkdownTemplateStatus,
  NormalizedAgentBlockBody,
  ParsedMarkdownSuppleEnd,
} from "./types"
