import { useSearchParams } from "react-router-dom"
import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { LxMarkdownEditor } from "@/components/ui/LxMarkdown"
import { useDesignEditor } from "@/features/design/hooks/useDesignEditor"

/**
 * 渲染设计页面。
 */
export const DesignPage = (): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const designId = searchParams.get("designId")
  const { content, hasDesign, isLoading, isSaved, loadedDesignId, save, setContent } =
    useDesignEditor(designId)
  const isDesignLoading = isLoading || (designId !== null && loadedDesignId !== designId)

  return (
    <div className="relative flex min-w-0 flex-1">
      <LxLoadingOverlay isLoading={isDesignLoading} text="Loading design..." />
      {!isDesignLoading && hasDesign && (
        <LxMarkdownEditor
          key={designId}
          initialContent={content}
          isSaved={isSaved}
          onChange={setContent}
          onSave={save}
        />
      )}
    </div>
  )
}
