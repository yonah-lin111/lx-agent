/**
 * 子代理头部展示标签：有角色时标注角色名；无角色时沿用 (task) 工具标注。
 */
export const formatSubagentLabel = (name: string, roleName?: string): string => {
  if (roleName) {
    return name === roleName ? ` - ${roleName}` : ` - ${name} (${roleName})`
  }
  return name !== "task" ? ` - ${name}(task)` : " - task"
}
