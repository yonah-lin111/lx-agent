import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { HashRouter } from "react-router-dom"
import { App } from "@/App"
import { applyThemeToDom, getInitialTheme } from "@/stores/themeStore"
import "@/styles.css"

// 应用启动前直接注入初始主题属性，避免加载闪烁。
applyThemeToDom(getInitialTheme())

// 全局禁止 Tab / Shift+Tab 默认焦点轮询选择元素。
// 仅保留终端（xterm）与 Markdown/CodeMirror 代码编辑器内部的 Tab 功能。
window.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Tab") return

    const target = event.target as HTMLElement | null
    if (!target) {
      event.preventDefault()
      return
    }

    // 1. 终端（xterm）捕获的按键放行
    if (target.closest(".xterm") || target.classList.contains("xterm-helper-textarea")) {
      return
    }

    // 2. CodeMirror 编辑器捕获的按键放行
    if (target.closest(".cm-editor") || target.classList.contains("cm-content")) {
      return
    }

    // 其余所有常规 HTML 元素（按钮、链接、普通容器等）彻底阻止 Tab 焦点导航
    event.preventDefault()
  },
  true,
)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
