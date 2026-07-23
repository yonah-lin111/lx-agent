import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { codeInspectorPlugin } from "code-inspector-plugin"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

export default defineConfig(() => ({
  main: {
    resolve: { alias: { "@": resolve("src/main") } },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    resolve: { alias: { "@": resolve("src/preload") } },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    server: { port: 6868 },
    resolve: { alias: { "@": resolve("src/renderer/src") } },
    plugins: [react(), tailwindcss(), codeInspectorPlugin({ bundler: "vite" })],
  },
}))
