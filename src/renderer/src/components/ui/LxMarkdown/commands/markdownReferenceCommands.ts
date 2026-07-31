import { LOCAL_IMAGE_PROTOCOL } from "@shared/localImage"

// Markdown 引用类型。
export type MarkdownReferenceType = "project" | "folder" | "file" | "image" | "common"

const referenceIconSvgs: Record<MarkdownReferenceType, string> = {
  folder:
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  project:
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-kanban"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/></svg>',
  file: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  image:
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
  common:
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bookmark"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>',
}

/**
 * 获取引用类型的 SVG 图标。
 */
export const getMarkdownReferenceIconSvg = (type: MarkdownReferenceType): string =>
  referenceIconSvgs[type]

/**
 * 判断值是否为受支持的 Markdown 引用类型。
 */
export const isMarkdownReferenceType = (value: string): value is MarkdownReferenceType =>
  ["project", "folder", "file", "image", "common"].includes(value)

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
  const pattern = /@\[refer-project\]\(((?:[^()\r\n]|\([^()\r\n]*\))+)\)/g

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

/**
 * 将本地图片绝对路径转换为可供渲染器加载的自定义协议 URL。
 */
export const getMarkdownReferenceImageSource = (path: string): string => {
  let localPath = path
  if (path.startsWith("file://")) {
    try {
      localPath = decodeURIComponent(new URL(path).pathname)
    } catch {
      return ""
    }
  }

  const encodedPath = localPath
    .split(/[\\/]+/)
    .map((part) => encodeURIComponent(part))
    .join("/")

  return `${LOCAL_IMAGE_PROTOCOL}://local${localPath.startsWith("/") ? "" : "/"}${encodedPath}`
}
