/**
 * V4A Apply Patch 解析器与校验器。
 * 格式对齐 OpenAI Codex (apply_patch.rs):
 * - 以 `*** Begin Patch` 或 `*** Begin Patch\n` 起始（也可由 `*** Add File: <path>`, `*** Update File: <path>`, `*** Delete File: <path>` 构成）
 * - 结尾可选 `*** End Patch`
 * - 支持三种动作：
 *   1. `*** Add File: <path>`
 *      - 随后的行（支持以 `+` 开头或纯文本）为新文件内容
 *   2. `*** Delete File: <path>`
 *      - 删除指定文件
 *   3. `*** Update File: <path>`
 *      - 包含一个或多个 `@@ ... @@` 或由 ` ` (context), `-` (removed), `+` (added) 构成的 diff hunk
 */

export type PatchAction =
  | {
      type: "add"
      path: string
      content: string
    }
  | {
      type: "delete"
      path: string
    }
  | {
      type: "update"
      path: string
      hunks: PatchHunk[]
    }

export interface PatchHunk {
  contextBefore?: string[]
  contextAfter?: string[]
  oldLines: string[]
  newLines: string[]
}

export interface ParsedPatch {
  actions: PatchAction[]
}

const normalizeToLF = (text: string): string => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

/**
 * 解析 V4A 格式补丁文本为动作列表。
 */
export const parsePatch = (patchText: string): ParsedPatch => {
  const normalized = normalizeToLF(patchText).trim()
  if (!normalized) {
    throw new Error("补丁内容不能为空。")
  }

  const lines = normalized.split("\n")
  const actions: PatchAction[] = []

  let i = 0
  // 跳过可能的 *** Begin Patch
  if (lines[i]?.startsWith("*** Begin Patch")) {
    i++
  }

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith("*** End Patch") || line.trim() === "") {
      i++
      continue
    }

    if (
      line.startsWith("*** Add File:") ||
      line.startsWith("*** Add File") ||
      line.startsWith("*** Create File:") ||
      line.startsWith("*** Create File")
    ) {
      let path = ""
      if (line.includes(":")) {
        path = line.slice(line.indexOf(":") + 1).trim()
      }
      i++
      const contentLines: string[] = []
      while (i < lines.length && !lines[i].startsWith("***")) {
        const fileLine = lines[i]
        // 兼容模型输出的 path: xxx 格式
        if (!path && fileLine.toLowerCase().startsWith("path:")) {
          path = fileLine.slice(5).trim()
          i++
          continue
        }
        if (fileLine.toLowerCase().startsWith("content:")) {
          const rest = fileLine.slice(8).trim()
          if (rest && rest !== "|") {
            contentLines.push(rest)
          }
          i++
          continue
        }
        // 兼容带前缀 '+' 或普通文本
        if (fileLine.startsWith("+")) {
          contentLines.push(fileLine.slice(1))
        } else {
          contentLines.push(fileLine)
        }
        i++
      }
      if (!path) throw new Error("Add File 路径不能为空。")
      // 去除末尾多余空行，保持真实内容
      while (contentLines.length > 0 && contentLines[contentLines.length - 1] === "") {
        contentLines.pop()
      }
      actions.push({
        type: "add",
        path,
        content: contentLines.join("\n"),
      })
      continue
    }

    if (line.startsWith("*** Delete File:")) {
      const path = line.replace("*** Delete File:", "").trim()
      if (!path) throw new Error("Delete File 路径不能为空。")
      i++
      actions.push({
        type: "delete",
        path,
      })
      continue
    }

    if (
      line.startsWith("*** Update File:") ||
      line.startsWith("*** Update File") ||
      line.startsWith("*** Modify File:") ||
      line.startsWith("*** Modify File")
    ) {
      let path = ""
      if (line.includes(":")) {
        path = line.slice(line.indexOf(":") + 1).trim()
      }
      i++
      const hunks: PatchHunk[] = []
      let currentOld: string[] = []
      let currentNew: string[] = []
      let hasHunkContent = false

      const flushHunk = () => {
        if (hasHunkContent || currentOld.length > 0 || currentNew.length > 0) {
          hunks.push({
            oldLines: currentOld,
            newLines: currentNew,
          })
          currentOld = []
          currentNew = []
          hasHunkContent = false
        }
      }

      while (i < lines.length && !lines[i].startsWith("***")) {
        const hunkLine = lines[i]
        // 兼容模型输出的 path: xxx 格式
        if (!path && hunkLine.toLowerCase().startsWith("path:")) {
          path = hunkLine.slice(5).trim()
          i++
          continue
        }
        if (hunkLine.startsWith("@@") || hunkLine.startsWith("---") || hunkLine.startsWith("+++")) {
          // 忽略 diff 标头
          if (hunkLine.startsWith("@@")) {
            flushHunk()
          }
          i++
          continue
        }

        if (hunkLine.startsWith("+")) {
          hasHunkContent = true
          currentNew.push(hunkLine.slice(1))
        } else if (hunkLine.startsWith("-")) {
          hasHunkContent = true
          currentOld.push(hunkLine.slice(1))
        } else if (hunkLine.startsWith(" ")) {
          // 上下文行
          hasHunkContent = true
          const ctx = hunkLine.slice(1)
          currentOld.push(ctx)
          currentNew.push(ctx)
        } else if (hunkLine.length === 0) {
          // 空行当做上下文空行
          currentOld.push("")
          currentNew.push("")
        } else {
          // 兜底作为上下文行
          currentOld.push(hunkLine)
          currentNew.push(hunkLine)
        }
        i++
      }
      flushHunk()

      if (!path) throw new Error("Update File 路径不能为空。")
      if (hunks.length === 0) {
        throw new Error(`Update File: ${path} 没有包含有效的 diff hunk。`)
      }

      actions.push({
        type: "update",
        path,
        hunks,
      })
      continue
    }

    throw new Error(`无法识别的补丁头部指令: "${line}"。`)
  }

  if (actions.length === 0) {
    throw new Error("未在补丁中解析出任何有效的文件操作（Add/Update/Delete）。")
  }

  return { actions }
}

/**
 * 校验并对单个文件应用 Update Hunks，返回替换后的新内容。
 * 遵循严格唯一上下文匹配规则。
 */
export const applyHunksToFile = (
  originalText: string,
  hunks: PatchHunk[],
  path: string,
): string => {
  const normOriginal = normalizeToLF(originalText)
  let current = normOriginal

  for (let idx = 0; idx < hunks.length; idx++) {
    const hunk = hunks[idx]
    const oldBlock = hunk.oldLines.join("\n")
    const newBlock = hunk.newLines.join("\n")

    if (oldBlock === "") {
      // 纯插入（无旧上下文匹配），若是首个 hunk 且原文件为空则直接作为内容
      if (current === "" && idx === 0) {
        current = newBlock
        continue
      }
      throw new Error(`文件 ${path} 的第 ${idx + 1} 个 hunk 缺少旧代码匹配上下文。`)
    }

    const matchIndex = current.indexOf(oldBlock)
    if (matchIndex === -1) {
      throw new Error(
        `文件 ${path} 的第 ${idx + 1} 个 hunk 无法在原文件中找到匹配的旧代码上下文。\n待匹配旧内容:\n${oldBlock.slice(0, 150)}...`,
      )
    }

    // 唯一性校验
    let occurrences = 0
    let searchFrom = 0
    while (searchFrom <= current.length - oldBlock.length) {
      const found = current.indexOf(oldBlock, searchFrom)
      if (found === -1) break
      occurrences++
      searchFrom = found + oldBlock.length
    }

    if (occurrences > 1) {
      throw new Error(
        `文件 ${path} 的第 ${idx + 1} 个 hunk 在原文件中命中 ${occurrences} 次，匹配不唯一。请增加更多上下文行。`,
      )
    }

    current = current.slice(0, matchIndex) + newBlock + current.slice(matchIndex + oldBlock.length)
  }

  return current
}
