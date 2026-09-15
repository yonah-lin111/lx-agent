import type { TemplatePresetOption } from "./types"

/**
 * 计算模板预设插入后的选中范围：定位首个属性键值冒号后的内容（不包含外层引号）。
 * 若值为空串（如 reference: ""），返回引号内部位置（start === end）。
 */
export const getTemplatePresetInitialSelectionRange = (
  content: string,
): { start: number; end: number } | null => {
  const match = /^[ \t]+[A-Za-z0-9_.-]+:[ \t]*(?:"([^"]*)"|'([^']*)'|([^\r\n]+))$/m.exec(content)
  if (!match || match.index === undefined) return null

  const lineText = match[0]
  const lineStart = match.index
  const doubleQuoteFirst = lineText.indexOf('"')
  const doubleQuoteLast = lineText.lastIndexOf('"')

  if (doubleQuoteFirst !== -1 && doubleQuoteLast > doubleQuoteFirst) {
    return {
      start: lineStart + doubleQuoteFirst + 1,
      end: lineStart + doubleQuoteLast,
    }
  }

  const singleQuoteFirst = lineText.indexOf("'")
  const singleQuoteLast = lineText.lastIndexOf("'")
  if (singleQuoteFirst !== -1 && singleQuoteLast > singleQuoteFirst) {
    return {
      start: lineStart + singleQuoteFirst + 1,
      end: lineStart + singleQuoteLast,
    }
  }

  const colonIndex = lineText.indexOf(":")
  if (colonIndex !== -1) {
    const afterColon = lineText.slice(colonIndex + 1)
    const trimmedStart = afterColon.search(/\S/)
    if (trimmedStart !== -1) {
      const start = lineStart + colonIndex + 1 + trimmedStart
      return {
        start,
        end: lineStart + lineText.length,
      }
    }
  }

  return null
}

export const MARKDOWN_TEMPLATE_PRESET_ADD_CONTENT = [
  "+++ presetTemplate --start 「title: Add Requirement」",
  "preset:",
  "  add:",
  '    reference: ""',
  '    location: ""',
  '    description: ""',
  "    requirements:",
  '      """',
  "      - ",
  '      """',
  "    notes:",
  '      """',
  "      - ",
  '      """',
  "+++ presetTemplate --end",
].join("\n")

export const MARKDOWN_TEMPLATE_PRESET_BUG_CONTENT = [
  "+++ presetTemplate --start 「title: Fix Bug」",
  "preset:",
  "  bug:",
  '    reference: ""',
  '    location: ""',
  '    description: ""',
  "    reproduction:",
  '      """',
  "      - ",
  '      """',
  "    requirements:",
  '      """',
  "      - ",
  '      """',
  "    expectations:",
  '      """',
  "      - ",
  '      """',
  "    notes:",
  '      """',
  "      - ",
  '      """',
  "+++ presetTemplate --end",
].join("\n")

export const MARKDOWN_TEMPLATE_PRESET_REFACTOR_CONTENT = [
  "+++ presetTemplate --start 「title: Refactor Feature」",
  "preset:",
  "  refactor:",
  '    reference: ""',
  '    location: ""',
  '    goal: ""',
  "    requirements:",
  '      """',
  "      - ",
  '      """',
  "    notes:",
  '      """',
  "      - ",
  '      """',
  "+++ presetTemplate --end",
].join("\n")

export const MARKDOWN_TEMPLATE_PRESET_COMMON_CONTENT = [
  "+++ presetTemplate --start 「title: Execute Task」",
  "preset:",
  "  common:",
  '    reference: ""',
  '    location: ""',
  "    requirements:",
  '      """',
  "      - ",
  '      """',
  "    expectations:",
  '      """',
  "      - ",
  '      """',
  "    notes:",
  '      """',
  "      - ",
  '      """',
  "+++ presetTemplate --end",
].join("\n")

export const MARKDOWN_TEMPLATE_PRESET_STYLE_CONTENT = [
  "+++ presetTemplate --start 「title: Design Style」",
  "preset:",
  "  style:",
  '    reference: ""',
  '    location: ""',
  "    requirements:",
  '      """',
  "      - ",
  '      """',
  "    expectations:",
  '      """',
  "      - ",
  '      """',
  "    notes:",
  '      """',
  "      - ",
  '      """',
  "+++ presetTemplate --end",
].join("\n")

export const MARKDOWN_TEMPLATE_PRESET_CONTENT = MARKDOWN_TEMPLATE_PRESET_ADD_CONTENT

export const MARKDOWN_TEMPLATE_PRESET_OPTIONS: TemplatePresetOption[] = [
  {
    id: "add",
    name: "Add Requirement",
    label: "add",
    description: "Blank preset for add requirement template",
    content: MARKDOWN_TEMPLATE_PRESET_ADD_CONTENT,
  },
  {
    id: "bug",
    name: "Fix Bug",
    label: "bug",
    description: "Blank preset for fix bug template",
    content: MARKDOWN_TEMPLATE_PRESET_BUG_CONTENT,
  },
  {
    id: "refactor",
    name: "Refactor Feature",
    label: "refactor",
    description: "Blank preset for refactor feature template",
    content: MARKDOWN_TEMPLATE_PRESET_REFACTOR_CONTENT,
  },
  {
    id: "common",
    name: "Execute Task",
    label: "common",
    description: "Blank preset for execute task template",
    content: MARKDOWN_TEMPLATE_PRESET_COMMON_CONTENT,
  },
  {
    id: "style",
    name: "Design Style",
    label: "style",
    description: "Blank preset for design style template",
    content: MARKDOWN_TEMPLATE_PRESET_STYLE_CONTENT,
  },
]
