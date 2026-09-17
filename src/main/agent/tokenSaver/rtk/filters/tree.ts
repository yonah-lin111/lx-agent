// tree 输出去掉摘要行并限长。
import { TREE_MAX_LINES } from "../constants"

// 压缩 tree 输出：丢弃 "X directories, Y files" 摘要行与首尾空行，超长截断。
export const tree = (input: string): string => {
  const lines = input.split("\n")
  if (lines.length === 0) return input

  const filtered: string[] = []
  for (const line of lines) {
    if (line.includes("director") && line.includes("file")) continue
    if (line.trim() === "" && filtered.length === 0) continue
    filtered.push(line)
  }

  while (filtered.length > 0 && (filtered[filtered.length - 1] ?? "").trim() === "") {
    filtered.pop()
  }

  if (filtered.length > TREE_MAX_LINES) {
    const cut = filtered.length - TREE_MAX_LINES
    return `${filtered.slice(0, TREE_MAX_LINES).join("\n")}\n... +${cut} more lines`
  }

  return filtered.join("\n")
}
