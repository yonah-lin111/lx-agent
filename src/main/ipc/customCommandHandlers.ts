import type {
  DeleteCustomCommandInput,
  ListCustomCommandsInput,
  SaveCustomCommandInput,
} from "@shared/contracts/customCommand"
import { CUSTOM_COMMAND_CHANNELS } from "@shared/ipc/customCommandChannels"
import { ipcMain } from "electron"
import { customCommandService } from "@/services/customCommandService"

export const registerCustomCommandHandlers = (): void => {
  ipcMain.handle(CUSTOM_COMMAND_CHANNELS.list, (_event, input?: ListCustomCommandsInput) => {
    try {
      return customCommandService.list(input)
    } catch (err) {
      console.error("[IPC] Failed to list custom commands:", err)
      return []
    }
  })

  ipcMain.handle(CUSTOM_COMMAND_CHANNELS.save, (_event, input: SaveCustomCommandInput) => {
    try {
      const item = customCommandService.save(input)
      return { ok: true, item }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message }
    }
  })

  ipcMain.handle(CUSTOM_COMMAND_CHANNELS.delete, (_event, input: DeleteCustomCommandInput) => {
    try {
      customCommandService.delete(input)
      return { ok: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message }
    }
  })
}
