import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { codeInspectorPlugin } from "code-inspector-plugin"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

export default defineConfig(() => ({
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
    server: { port: 6868 },
    resolve: { alias: { "@": resolve("src/renderer/src"), "@shared": resolve("src/shared") } },
    plugins: [react(), tailwindcss(), codeInspectorPlugin({ bundler: "vite" })],
  },
}))
