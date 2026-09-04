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
        "@xterm/addon-unicode11"
      ],
    },
  },
}))
