import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"

// 解析相对 cwd 的路径；若为相对路径，则优先以 cwd（当前目录）解析。不限制在 cwd 目录内。
export const resolveToCwd = (filePath: string, cwd: string): string | null => {
  return isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath)
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
