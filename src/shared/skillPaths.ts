// Skill 名称与相对路径校验（main 与 renderer 共用的纯函数）。

// Skill 名称长度上限（对齐 Agent Skills spec）。
export const MAX_SKILL_NAME_LENGTH = 64
// 路径段长度上限（Windows 全路径上限的保守分摊）。
export const MAX_SKILL_SEGMENT_LENGTH = 120

// Windows 保留设备名（跨平台创建一律拦截）。
const WINDOWS_RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
])

// 文件名禁用字符：Windows 非法字符 + 控制字符。
// biome-ignore lint/suspicious/noControlCharactersInRegex: 跨平台文件名校验必须拦截控制字符。
const INVALID_NAME_CHARS = /[<>:"|?*\u0000-\u001f]/

// 类绝对路径判断（POSIX 根、Windows 盘符与 UNC）。
const isAbsoluteLike = (value: string): boolean =>
  value.startsWith("/") || value.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(value)

// 校验 Skill 名称（小写字母、数字与连字符）；合法返回 null。
export const validateSkillName = (name: string): string | null => {
  const trimmed = name.trim()
  if (!trimmed) return "Skill name is required."
  if (trimmed.length > MAX_SKILL_NAME_LENGTH) {
    return `Skill name must not exceed ${MAX_SKILL_NAME_LENGTH} characters.`
  }
  if (!/^[a-z0-9-]+$/.test(trimmed)) {
    return "Skill name may only contain lowercase letters, numbers, and hyphens."
  }
  if (trimmed.startsWith("-") || trimmed.endsWith("-")) {
    return "Skill name must not start or end with a hyphen."
  }
  if (trimmed.includes("--")) return "Skill name must not contain consecutive hyphens."
  return null
}

// 校验单个路径段；合法返回 null。
export const validateSkillPathSegment = (segment: string): string | null => {
  if (!segment || segment === "." || segment === "..") return "Invalid path segment."
  if (segment.length > MAX_SKILL_SEGMENT_LENGTH) return "Path segment is too long."
  if (INVALID_NAME_CHARS.test(segment))
    return `Path segment contains invalid characters: ${segment}`
  const dotIndex = segment.lastIndexOf(".")
  const stem = dotIndex > 0 ? segment.slice(0, dotIndex) : segment
  if (WINDOWS_RESERVED_NAMES.has(stem.toLowerCase())) {
    return `Path segment uses a reserved name: ${segment}`
  }
  if (segment.endsWith(".") || segment.endsWith(" ")) {
    return "Path segment must not end with a dot or space."
  }
  return null
}

// 校验 skill 目录内的相对路径（posix 或系统分隔符均接受）；合法返回 null。
export const validateSkillRelativePath = (relativePath: string): string | null => {
  const trimmed = relativePath.trim()
  if (!trimmed) return "Relative path is required."
  if (isAbsoluteLike(trimmed)) return "Relative path must not be absolute."
  for (const segment of trimmed.split(/[\\/]/)) {
    const error = validateSkillPathSegment(segment)
    if (error) return error
  }
  return null
}
