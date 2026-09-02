const ACCEPTED_PLANS_KEY = "lx_agent_accepted_plans"

/**
 * 获取所有已采纳执行的方案唯一 Key 集合
 */
function getAcceptedPlanKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(ACCEPTED_PLANS_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        return new Set(arr)
      }
    }
  } catch (err) {
    console.error("Failed to parse accepted plans from storage:", err)
  }
  return new Set()
}

/**
 * 判断指定方案是否已被采纳执行
 */
export function isPlanAccepted(planKey: string): boolean {
  if (!planKey) return false
  return getAcceptedPlanKeys().has(planKey)
}

/**
 * 标记指定方案为已采纳执行（持久化到 localStorage）
 */
export function markPlanAccepted(planKey: string): void {
  if (!planKey) return
  try {
    const keys = getAcceptedPlanKeys()
    keys.add(planKey)
    localStorage.setItem(ACCEPTED_PLANS_KEY, JSON.stringify(Array.from(keys)))
  } catch (err) {
    console.error("Failed to persist accepted plan key:", err)
  }
}
