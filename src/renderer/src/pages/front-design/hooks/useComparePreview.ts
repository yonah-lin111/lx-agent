import { useEffect, useMemo, useRef, useState } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import { buildPreviewDocument } from "@/pages/front-design/utils/previewDocument"

export interface UseComparePreviewOptions {
  html: string
  mode?: "tailwindcss" | "css"
  effectiveMode: "light" | "dark"
}

export interface UseComparePreviewResult {
  // 对照窗静态 srcDoc：选中版本 / 主题变化时重建。
  srcDoc: string
}

/**
 * 对照窗预览域：按选中版本编译 Tailwind 并构建静态沙箱文档（不做增量更新与落盘）。
 */
export const useComparePreview = ({
  html,
  mode,
  effectiveMode,
}: UseComparePreviewOptions): UseComparePreviewResult => {
  const [compiledTailwindCss, setCompiledTailwindCss] = useState<string>("")
  const latestHtmlRef = useRef<string>("")
  latestHtmlRef.current = html

  // 与主预览同策略的 150ms 防抖，避免切换对照版本时高频编译。
  useEffect(() => {
    if (!html || mode === "css") {
      setCompiledTailwindCss("")
      return
    }

    let isMounted = true
    const timer = setTimeout(() => {
      void agentApi.compileTailwind(html).then((css) => {
        if (isMounted && latestHtmlRef.current === html) {
          setCompiledTailwindCss(css)
        }
      })
    }, 150)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [html, mode])

  const srcDoc = useMemo(
    () => buildPreviewDocument(html, { effectiveMode, compiledTailwindCss, withErrorGuard: false }),
    [html, effectiveMode, compiledTailwindCss],
  )

  return { srcDoc }
}
