import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { HashRouter } from "react-router-dom"
import { App } from "@/App"
import { applyThemeToDom, getInitialTheme } from "@/stores/themeStore"
import "@/styles.css"

// 应用启动前直接注入初始主题属性，避免加载闪烁。
applyThemeToDom(getInitialTheme())

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
