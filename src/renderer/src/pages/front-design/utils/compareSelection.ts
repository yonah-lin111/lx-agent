// 版本对照目标选择：纯函数，决定开启对照时默认展示哪个版本。

import type { FrontDesignItem } from "@/features/agent/hooks/frontDesignStore"

/**
 * 选择默认对照版本：优先当前版本的前一版；当前是首版时取后一版；无候选返回 null。
 */
export const pickDefaultCompareDesign = (
  versions: FrontDesignItem[],
  activeDesignId: string | null,
): string | null => {
  if (!activeDesignId || versions.length < 2) return null
  const index = versions.findIndex((item) => item.id === activeDesignId)
  if (index < 0) return null
  return versions[index - 1]?.id ?? versions[index + 1]?.id ?? null
}
