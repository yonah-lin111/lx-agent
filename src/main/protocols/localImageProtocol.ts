import { extname } from "node:path"
import { pathToFileURL } from "node:url"
import { LOCAL_IMAGE_PROTOCOL } from "@shared/localImage"
import { net, protocol } from "electron"

const supportedImageExtensions = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
])

/**
 * 注册供 renderer 图片元素使用的本地图片协议。
 */
export const registerLocalImageProtocol = (): void => {
  protocol.handle(LOCAL_IMAGE_PROTOCOL, (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== "local") return new Response(null, { status: 400 })

      const imagePath = decodeURIComponent(url.pathname)
      if (!imagePath.startsWith("/")) return new Response(null, { status: 400 })
      if (!supportedImageExtensions.has(extname(imagePath).toLowerCase())) {
        return new Response(null, { status: 415 })
      }

      return net.fetch(pathToFileURL(imagePath).toString())
    } catch {
      return new Response(null, { status: 400 })
    }
  })
}
