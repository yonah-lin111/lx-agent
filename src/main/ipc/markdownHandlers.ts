import { MARKDOWN_CHANNELS } from "@shared/ipc/markdownChannels"
import { ipcMain } from "electron"
import { promptTemplateLoader } from "@/agent/prompts/promptTemplateLoader"
import { generateTemplateTitle } from "@/agent/titleGenerator"

// 校验输入为合法模板块内容字符串（IPC 输入边界）。
const isValidTemplateContent = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0

/**
 * 注册 Markdown 领域 IPC 处理器。
 */
export const registerMarkdownHandlers = (): void => {
  ipcMain.handle(MARKDOWN_CHANNELS.generateTemplateTitle, (_event, content: unknown) => {
    if (!isValidTemplateContent(content)) return null
    return generateTemplateTitle(content)
  })

  ipcMain.handle(MARKDOWN_CHANNELS.listMarkdownCommands, (_event, cwd: unknown) => {
    const validCwd = typeof cwd === "string" && cwd.trim() ? cwd.trim() : undefined
    return promptTemplateLoader.listMarkdownCommands(validCwd)
  })
}
