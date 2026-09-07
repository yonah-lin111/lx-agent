import { existsSync } from "node:fs"
import { normalize, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { FRONT_DESIGN_PROTOCOL } from "@shared/frontDesign"
import { net, protocol } from "electron"
import { getSessionDesignDir } from "@/paths"

/**
 * 注册供 webview 加载落盘前端设计原型的自定义协议。
 *
 * 规范：lx-design://design/{sessionId}/{designId}/{fileName}
 * 例如：lx-design://design/session-123/design-456/index.html
 */
export const registerFrontDesignProtocol = (): void => {
  protocol.handle(FRONT_DESIGN_PROTOCOL, (request) => {
    try {
      const url = new URL(request.url)
      // 域名必须为 design
      if (url.hostname !== "design") {
        return new Response("Invalid hostname", { status: 400 })
      }

      // pathname 形式为 /:sessionId/:designId/:subPath*
      const parts = url.pathname.replace(/^\/+/, "").split("/").map(decodeURIComponent)
      if (parts.length < 2) {
        return new Response("Missing sessionId or designId", { status: 400 })
      }

      const [sessionId, designId, ...rest] = parts
      const relativeFile = rest.join("/") || "index.html"

      const baseDir = resolve(getSessionDesignDir(sessionId, designId))
      const targetFilePath = resolve(baseDir, normalize(relativeFile))

      // 防止目录遍历越界
      if (!targetFilePath.startsWith(baseDir)) {
        return new Response("Forbidden", { status: 403 })
      }

      if (!existsSync(targetFilePath)) {
        return new Response("Not Found", { status: 404 })
      }

      return net.fetch(pathToFileURL(targetFilePath).toString())
    } catch {
      return new Response("Bad Request", { status: 400 })
    }
  })
}
