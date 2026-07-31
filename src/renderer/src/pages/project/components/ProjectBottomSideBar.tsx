import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { projectApi } from "@/features/project/api/projectApi"

// 从设计内容中提取 Markdown 引用。
const getDesignReferences = (content: string): string[] => {
  const references: string[] = []
  const pattern = /@\[refer-folder\]\(([^()\r\n]+)\)/g

  let match = pattern.exec(content)
  while (match) {
    const reference = match[0]
    if (reference) references.push(reference)
    match = pattern.exec(content)
  }

  return references
}

interface ProjectBottomSideBarProps {
  isExpanded?: boolean
}

/**
 * 渲染当前设计中的引用内容。
 */
export const ProjectBottomSideBar = ({
  isExpanded = false,
}: ProjectBottomSideBarProps): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const designId = searchParams.get("designId")
  const [content, setContent] = useState("")
  const previewRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let isCurrent = true

    const loadDesign = async (): Promise<void> => {
      setContent("")
      if (!designId) {
        return
      }

      try {
        const design = (await projectApi.list()).find((item) => item.id === designId)
        if (isCurrent) setContent(design?.designData ?? "")
      } catch (error) {
        if (isCurrent) setContent("")
        console.error("Failed to load design references", error)
      }
    }

    void loadDesign()
    return () => {
      isCurrent = false
    }
  }, [designId])

  const referencesHtml = useMemo(() => {
    const references = getDesignReferences(content)
    return references.length > 0 ? markdownRenderer.render(references.join(" ")) : ""
  }, [content])

  return (
    <div
      className={`absolute inset-0 min-w-0 overflow-hidden ${
        isExpanded ? "flex items-start justify-start" : "flex items-center pr-24"
      }`}
    >
      {referencesHtml && (
        <LxMarkdownPreview
          html={referencesHtml}
          previewMode="preview"
          previewRef={previewRef}
          className="min-w-0 flex-none overflow-x-auto overflow-y-hidden px-0"
          contentClassName="min-w-0 overflow-hidden py-0 [&>p]:m-0 [&>p]:flex [&>p]:min-w-0 [&>p]:flex-nowrap [&>p]:gap-1"
        />
      )}
    </div>
  )
}
