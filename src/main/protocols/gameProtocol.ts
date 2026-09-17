import { existsSync, readFileSync, statSync } from "node:fs"
import { extname, normalize, resolve, sep } from "node:path"
import { GAME_PROTOCOL } from "@shared/contracts/game"
import { protocol } from "electron"
import { getEmulatorAssetsDir } from "@/lib/emulatorAssets"
import { gameRomService } from "@/services/gameRomService"

// 模拟器宿主页 CSP：仅放行本协议资产与 WASM 编译/blob worker，不放开主窗口防线。
const WRAPPER_CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ")

// 扩展名 → Content-Type（仅覆盖自托管资产实际用到的类型）。
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
}

const contentTypeOf = (filePath: string): string =>
  MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"

// 文件响应：统一 no-store，避免用户替换 ROM/存档后命中陈旧缓存。
const fileResponse = (filePath: string, extraHeaders: Record<string, string> = {}): Response =>
  new Response(new Uint8Array(readFileSync(filePath)), {
    headers: {
      "Content-Type": contentTypeOf(filePath),
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  })

/**
 * 注册供 webview 加载模拟器宿主页、静态资产、ROM 与存档的自定义协议。
 *
 * 规范：lx-game://emulator/{wrapper.html|wrapper.js|data/**|rom/<entryId>|sav/<entryId>}
 * ROM 与存档一律按条目 id 由主进程解析，协议不接受任意文件路径。
 */
export const registerGameProtocol = (): void => {
  protocol.handle(GAME_PROTOCOL, (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== "emulator") {
        return new Response("Invalid hostname", { status: 400 })
      }

      const segments = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean)
      const [head, ...rest] = segments
      if (!head) return new Response("Not Found", { status: 404 })

      if (head === "rom" || head === "sav") {
        const entryId = Number.parseInt(rest[0] ?? "", 10)
        if (!Number.isInteger(entryId) || entryId <= 0) {
          return new Response("Bad Request", { status: 400 })
        }

        if (head === "rom") {
          const romPath = gameRomService.getRomFilePath(entryId)
          if (!romPath) return new Response("Not Found", { status: 404 })
          return fileResponse(romPath)
        }

        const save = gameRomService.readSave(entryId)
        if (!save) return new Response("Not Found", { status: 404 })
        return new Response(new Uint8Array(save), {
          headers: {
            "Content-Type": "application/octet-stream",
            "Cache-Control": "no-store",
          },
        })
      }

      // 静态资产：wrapper.html / wrapper.js / data/**（目录遍历守卫）。
      const assetsDir = resolve(getEmulatorAssetsDir())
      const relativePath = head === "" ? "wrapper.html" : segments.join("/")
      const targetPath = resolve(assetsDir, normalize(relativePath))
      if (targetPath !== assetsDir && !targetPath.startsWith(assetsDir + sep)) {
        return new Response("Forbidden", { status: 403 })
      }
      if (!existsSync(targetPath) || !statSync(targetPath).isFile()) {
        return new Response("Not Found", { status: 404 })
      }

      // 宿主页额外附带独立 CSP；静态 JS/CSS/核心数据沿用默认响应头。
      if (targetPath.endsWith(".html")) {
        return fileResponse(targetPath, { "Content-Security-Policy": WRAPPER_CSP })
      }
      return fileResponse(targetPath)
    } catch (error) {
      if (error instanceof Error && error.message === "GAME_ENTRY_NOT_FOUND") {
        return new Response("Not Found", { status: 404 })
      }
      return new Response("Internal Error", { status: 500 })
    }
  })
}
