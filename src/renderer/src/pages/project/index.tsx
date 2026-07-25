import { useSearchParams } from "react-router-dom"
import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { LxMarkdownEditor } from "@/components/ui/LxMarkdown/LxMarkdownEditor"
import { useProjectEditor } from "@/features/project/hooks/useProjectEditor"

/**
 * 渲染设计页面。
 */
export const ProjectPage = (): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const designId = searchParams.get("designId")
  const { content, hasDesign, isLoading, isSaved, loadedDesignId, save, setContent } =
    useProjectEditor(designId)
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
      {!isDesignLoading && !designId && (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-[6px] border border-white/5 bg-[#212121]">
          <span className="text-sm text-white/60">请选择一个设计</span>
        </div>
      )}
      {!isDesignLoading && designId && !hasDesign && (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-[6px] border border-white/5 bg-[#212121]">
          <span className="text-sm text-white/60">未找到设计</span>
        </div>
      )}
    </div>
  )
}
