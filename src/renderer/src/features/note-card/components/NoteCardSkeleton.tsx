import type React from "react"

// 骨架占位卡片：脉冲闪烁，形状与真实卡片一致。
const SkeletonCard = (): React.JSX.Element => (
  <div className="flex h-[200px] w-full shrink-0 flex-col gap-3 rounded-[6px] border border-white/5 bg-white/[0.04] p-3">
    <div className="h-4 w-1/3 rounded-[4px] bg-white/[0.08]" />
    <div className="mt-2 h-3 w-full rounded-[4px] bg-white/[0.08]" />
    <div className="h-3 w-5/6 rounded-[4px] bg-white/[0.08]" />
    <div className="h-3 w-4/6 rounded-[4px] bg-white/[0.08]" />
  </div>
)

/**
 * 笔记卡片列表加载期间的骨架屏。
 */
export const NoteCardSkeleton = (): React.JSX.Element => (
  <div aria-hidden="true" className="flex animate-pulse flex-col gap-2">
    <SkeletonCard />
    <SkeletonCard />
  </div>
)
