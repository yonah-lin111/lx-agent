import type React from "react"

import { LxMarkdownEditor } from "@/components/ui/LxMarkdown"
import { useTranslation } from "@/i18n"

/**
 * 预览 LxMarkdown 组件。
 */
export const LxMarkdownDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex h-[520px] flex-col">
      <LxMarkdownEditor
        initialContent={t("uiPreview.demos.mock.markdownSample")}
        showLineNumbers
        showFolding
      />
    </div>
  )
}
