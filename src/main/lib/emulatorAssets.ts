import { join } from "node:path"
import { app } from "electron"

/**
 * 获取 EmulatorJS 自托管资产目录：开发态取仓库 resources/emulator，打包态取 extraResources 目录。
 */
export const getEmulatorAssetsDir = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, "resources", "emulator")
    : join(app.getAppPath(), "resources", "emulator")
