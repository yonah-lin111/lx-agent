import type React from "react"

// 主体内容区域属性。
interface PageContentProps {
  children: React.ReactNode
}

/**
 * 渲染主体内容区域。
 */
export const PageContent = ({ children }: PageContentProps): React.JSX.Element => {
  return <main className="min-h-0 flex flex-1 gap-3 overflow-hidden">{children}</main>
}
