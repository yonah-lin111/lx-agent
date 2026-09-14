import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"

// 解析为绝对路径：绝对路径规范化，相对路径以 cwd 为基准；读类工具不设路径边界（产品决策）。
export const resolveToCwd = (filePath: string, cwd: string): string => {
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
