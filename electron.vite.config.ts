import { createServer } from "node:net"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { codeInspectorPlugin } from "code-inspector-plugin"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

// renderer 端口探测起点与扫描上限。
const RENDERER_PORT_START = 6868
const RENDERER_PORT_SCAN_LIMIT = 100

// 探测端口是否空闲；host 与 electron-vite 解析 Vite 实际监听端口时使用的默认 host 保持一致。
const isPortFree = (port: number): Promise<boolean> =>
  new Promise((resolveFree) => {
    const server = createServer()
    server.once("error", () => resolveFree(false))
    server.listen(port, "localhost", () => {
      server.close(() => resolveFree(true))
    })
  })

/**
 * 探测第一个空闲的 renderer 端口。
 *
 * electron-vite 用配置端口拼 ELECTRON_RENDERER_URL，不读 Vite 实际监听端口；
 * 固定端口下第二个 dev 实例的 Vite 会静默自增，而 Electron 仍指向上一个实例的 dev server。
 * 因此先探测空闲端口，再配合 strictPort 保证上报 URL 与实际监听一致。
 */
const findFreeRendererPort = async (): Promise<number> => {
  for (
    let port = RENDERER_PORT_START;
    port < RENDERER_PORT_START + RENDERER_PORT_SCAN_LIMIT;
    port++
  ) {
    if (await isPortFree(port)) return port
  }
  throw new Error(
    `未找到空闲的 renderer 端口（${RENDERER_PORT_START}-${RENDERER_PORT_START + RENDERER_PORT_SCAN_LIMIT - 1}），请释放端口后重试。`,
  )
}

export default defineConfig(async () => {
  const rendererPort = await findFreeRendererPort()
  return {
    main: {
      resolve: { alias: { "@": resolve("src/main"), "@shared": resolve("src/shared") } },
      plugins: [externalizeDepsPlugin()],
    },
    preload: {
      build: {
        rollupOptions: {
          output: { format: "cjs" as const },
        },
      },
      resolve: { alias: { "@": resolve("src/preload"), "@shared": resolve("src/shared") } },
      plugins: [externalizeDepsPlugin()],
    },
    renderer: {
      // worktree 通过软链共享主仓库 node_modules，默认缓存目录会被多实例并发读写，故落到本 worktree。
      cacheDir: resolve(".vite"),
      server: { port: rendererPort, strictPort: true },
      resolve: { alias: { "@": resolve("src/renderer/src"), "@shared": resolve("src/shared") } },
      plugins: [react(), tailwindcss(), codeInspectorPlugin({ bundler: "vite" })],
      optimizeDeps: {
        include: [
          "react",
          "react-dom",
          "react-dom/client",
          "react-router-dom",
          "lucide-react",
          "zustand",
          "mermaid",
          "markdown-it",
          "highlight.js/lib/core",
          "@codemirror/state",
          "@codemirror/view",
          "@codemirror/language",
          "@codemirror/commands",
          "@codemirror/lang-markdown",
          "@codemirror/language-data",
          "@lezer/highlight",
          "@lezer/markdown",
          "@xterm/xterm",
          "@xterm/addon-fit",
          "@xterm/addon-webgl",
          "@xterm/addon-web-links",
          "@xterm/addon-unicode11",
        ],
      },
    },
  }
})
