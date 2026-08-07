import { MARKDOWN_CHANNELS } from "@shared/ipc/markdownChannels"
import { ipcMain } from "electron"
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
}
