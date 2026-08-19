import type { MarkdownApi } from "@shared/contracts/markdown"
import { MARKDOWN_CHANNELS } from "@shared/ipc/markdownChannels"
import { ipcRenderer } from "electron"

// Markdown 领域 preload API：模板块标题生成与自定义斜杠命令列表。
export const markdownApi: MarkdownApi["markdown"] = {
  generateTemplateTitle: (content: string) =>
    ipcRenderer.invoke(MARKDOWN_CHANNELS.generateTemplateTitle, content),
  listMarkdownCommands: (cwd?: string) =>
    ipcRenderer.invoke(MARKDOWN_CHANNELS.listMarkdownCommands, cwd),
}
