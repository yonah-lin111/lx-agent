// 变量模板块：开始行之后固定带 @content 保留键，用于存放 @ 文件与 @ 引用内容。
export const MARKDOWN_TEMPLATE_VAR_CONTENT = [
  "$$$ varTemplate --start 「title: 」",
  "@content:",
  'key: "var"',
  "$$$ varTemplate --end",
].join("\n")

export const MARKDOWN_TEMPLATE_ADD_CONTENT = [
  "&&& addTemplate --start 「title: 」",
  "# Add Requirement",
  "",
  "- Reference: ",
  "- Location: ",
  "- Description: ",
  "- Requirements: ",
  "  - ",
  "- Notes: ",
  "  - ",
  "&&& addTemplate --end",
].join("\n")

export const MARKDOWN_TEMPLATE_BUG_CONTENT = [
  "&&& bugTemplate --start 「title: 」",
  "# Fix Bug",
  "",
  "- Reference: ",
  "- Location: ",
  "- Description: ",
  "- Reproduction: ",
  "- Requirements: ",
  "  - ",
  "- Expectations: ",
  "- Notes: ",
  "  - ",
  "&&& bugTemplate --end",
].join("\n")

export const MARKDOWN_TEMPLATE_REFACTOR_CONTENT = [
  "&&& refactorTemplate --start 「title: 」",
  "# Refactor Feature",
  "",
  "- Reference: ",
  "- Location: ",
  "- Goal: ",
  "- Requirements: ",
  "  - ",
  "- Notes: ",
  "  - ",
  "&&& refactorTemplate --end",
].join("\n")

export const MARKDOWN_TEMPLATE_COMMON_CONTENT = [
  "&&& commonTemplate --start 「title: 」",
  "# Execute Task",
  "",
  "- Reference: ",
  "- Location: ",
  "- Requirements: ",
  "  - ",
  "- Expectations: ",
  "- Notes: ",
  "  - ",
  "&&& commonTemplate --end",
].join("\n")

export const MARKDOWN_TEMPLATE_STYLE_CONTENT = [
  "&&& styleTemplate --start 「title: 」",
  "# Design Style",
  "",
  "- Reference: ",
  "- Location: ",
  "- Requirements: ",
  "  - ",
  "- Expectations: ",
  "- Notes: ",
  "  - ",
  "&&& styleTemplate --end",
].join("\n")

export const MARKDOWN_TEMPLATE_SUPPLE_CONTENT = [
  "+++ suppleTemplate --start",
  "## Supplementary Requirements",
  "",
  "- Reference: ",
  "- Requirements: ",
  "  - ",
  "- Notes: ",
  "  - ",
  "+++ suppleTemplate --end",
].join("\n")

export const MARKDOWN_TEMPLATE_LOG_CONTENT = [
  "%%% logTemplate --start",
  "## Execution Log",
  "",
  "- Time: ",
  "- Phase: ",
  "- Records: ",
  "  - ",
  "- Conclusion: ",
  "%%% logTemplate --end",
].join("\n")
