import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { GAME_CHANNELS } from "@shared/ipc/gameChannels"
import { dialog, ipcMain } from "electron"
import { getEmulatorAssetsDir } from "@/lib/emulatorAssets"
import { gameRomService } from "@/services/gameRomService"

/**
 * 注册游戏导入、条目管理与模拟器运行时的 IPC 处理器。
 *
 * 字段级校验归 service；导入弹窗仅收集文件路径，取消时返回空数组。
 */
export const registerGameHandlers = (): void => {
  ipcMain.handle(GAME_CHANNELS.list, () => gameRomService.list())

  ipcMain.handle(GAME_CHANNELS.importFromDialog, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "GBA", extensions: ["gba"] }],
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return gameRomService.importFiles(result.filePaths)
  })

  ipcMain.handle(GAME_CHANNELS.rename, (_, id: number, title: string) =>
    gameRomService.rename(id, title),
  )

  ipcMain.handle(GAME_CHANNELS.remove, (_, id: number) => gameRomService.remove(id))

  ipcMain.handle(GAME_CHANNELS.markPlayed, (_, id: number) => gameRomService.markPlayed(id))

  ipcMain.handle(GAME_CHANNELS.writeSave, (_, id: number, data: unknown) =>
    gameRomService.writeSave(id, data),
  )

  ipcMain.handle(GAME_CHANNELS.getRuntimeConfig, () => ({
    guestPreloadUrl: pathToFileURL(join(getEmulatorAssetsDir(), "guest-preload.cjs")).toString(),
  }))
}
