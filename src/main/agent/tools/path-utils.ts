import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"

// 判断目标路径是否位于 root 内（相对路径 `..` 逃逸或绝对路径越界拒绝）。
const isPathWithinRoot = (root: string, target: string): boolean => {
  const rel = relative(root, target)
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
}

// 解析相对 cwd 的路径；绝对路径在 cwd 内时保留。越界返回 null。
export const resolveToCwd = (filePath: string, cwd: string): string | null => {
  const target = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath)
  return isPathWithinRoot(cwd, target) ? target : null
}

// 路径是否存在。
export const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}
