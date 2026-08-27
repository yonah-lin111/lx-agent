import type React from "react"

// 主体内容区域属性。
export interface PageContentProps {
  children: React.ReactNode
  className?: string
}

/**
 * 渲染主体内容区域。
 */
export const PageContent = ({
  children,
  className = "",
}: PageContentProps): React.JSX.Element => {
  return (
    <main
      className={`page-content app-page-content min-h-0 flex flex-1 gap-3 overflow-hidden ${className}`.trim()}
    >
      {children}
    </main>
  )
}
