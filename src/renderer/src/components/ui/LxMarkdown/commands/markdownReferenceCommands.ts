// Markdown 引用类型。
export type MarkdownReferenceType = "project" | "file" | "image"

// Markdown 引用命令。
export interface MarkdownReferenceCommand {
  id: MarkdownReferenceType
  label: string
  description: string
}

const markdownReferenceCommands: MarkdownReferenceCommand[] = [
  { id: "project", label: "参考项目", description: "将路径标记为项目引用" },
  { id: "file", label: "参考文件", description: "将路径标记为文件引用" },
  { id: "image", label: "参考图片", description: "将路径标记为图片引用" },
]

/**
 * 获取可选择的 Markdown 引用命令。
 */
export const getMarkdownReferenceCommands = (): MarkdownReferenceCommand[] =>
  markdownReferenceCommands

/**
 * 判断值是否为受支持的 Markdown 引用类型。
 */
export const isMarkdownReferenceType = (value: string): value is MarkdownReferenceType =>
  markdownReferenceCommands.some((command) => command.id === value)

/**
 * 从 Markdown 引用标记解析引用类型。
 */
export const getMarkdownReferenceType = (value: string): MarkdownReferenceType | null => {
  const type = value.replace(/^refer-/, "")

  return isMarkdownReferenceType(type) ? type : null
}

/**
 * 从 Markdown 内容中读取全部引用项目路径。
 */
export const getMarkdownReferenceProjectPaths = (value: string): string[] => {
  const paths = new Set<string>()
  const pattern = /@\[refer-project\]\(([^)\r\n]+)\)/g

  let match = pattern.exec(value)
  while (match) {
    const path = match[1]?.trim()
    if (path) paths.add(path)
    match = pattern.exec(value)
  }

  return [...paths]
}

/**
 * 根据类型和路径创建 Markdown 引用。
 */
export const createMarkdownReference = (type: MarkdownReferenceType, path: string): string =>
  `@[refer-${type}](${path})`

/**
 * 获取引用类型的展示标签。
 */
export const getMarkdownReferenceLabel = (type: MarkdownReferenceType): string => `${type}:`

/**
 * 从路径中提取适合展示的文件或目录名称。
 */
export const getMarkdownReferenceName = (path: string): string => {
  const normalizedPath = path.replace(/[\\/]+$/, "")
  const name = normalizedPath.split(/[\\/]/).pop()

  if (!name) return path

  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}
