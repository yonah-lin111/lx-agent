// 发送端设计引用注入：把显式 @design 引用或画布激活设计编译为模型可见的上下文块。

import type { CollaborationMode } from "@shared/contracts/agent"
import { extractDesignMentions } from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"
import { buildDesignOutline } from "@/features/agent/utils/designOutline"
import { extractDesignTargetContext } from "@/features/agent/utils/designSynthesizer"

// 注入候选设计的最小字段集（FrontDesignItem 的结构子集）。
export interface DesignReferenceCandidate {
  id: string
  title: string
  html: string
  mode?: "tailwindcss" | "css"
  sessionId?: string | null
  version?: number
}

export interface BuildDesignReferenceBlocksOptions {
  collaborationMode: CollaborationMode
  currentSessionId?: string | null
  activeDesign?: DesignReferenceCandidate | null
  resolveDesign: (id: string) => DesignReferenceCandidate | null
}

const DEFAULT_TITLE = "Frontend Prototype"

/**
 * 构造注入到用户消息头部的设计上下文块。
 *
 * - 存在任意显式 `@design:{id}` 引用时：只注入 `<referenced_design>`（显式优先，自动基线让位）。
 * - 无显式引用且处于 design 模式时：注入画布激活设计的 `<current_design>` 作为默认修改基线。
 * - 激活设计已绑定会话时必须与当前会话一致，避免跨会话拿错基线；草稿设计（无 sessionId）放行。
 */
export const buildDesignReferenceBlocks = (
  text: string,
  options: BuildDesignReferenceBlocksOptions,
): string[] => {
  const mentions = extractDesignMentions(text)

  if (mentions.length > 0) {
    const blocks: string[] = []
    for (const mention of mentions) {
      const design = options.resolveDesign(mention.id)
      if (!design || !design.html) continue

      const title = design.title || DEFAULT_TITLE
      const mode = design.mode ?? "tailwindcss"

      if (mention.target) {
        const targetContext = extractDesignTargetContext(design.html, mention.target)
        if (targetContext.ok && targetContext.targetElementHtml) {
          blocks.push(
            `<referenced_design id="${design.id}" target="${mention.target}" title="${title}" mode="${mode}">\n<global_styling_context>\n  ${targetContext.globalContext}\n</global_styling_context>\n<target_element selector="${mention.target}">\n${targetContext.targetElementHtml}\n</target_element>\n</referenced_design>`,
          )
          continue
        }
        // 目标节点未找到时降级全量注入。
      }

      const outline = buildDesignOutline(design.html)
      const outlineBlock = outline ? `\n<design_outline>\n${outline}\n</design_outline>` : ""
      blocks.push(
        `<referenced_design id="${design.id}" title="${title}" mode="${mode}">\n${design.html}${outlineBlock}\n</referenced_design>`,
      )
    }
    return blocks
  }

  if (options.collaborationMode !== "design") return []

  const active = options.activeDesign
  if (!active || !active.html) return []
  if (active.sessionId && active.sessionId !== options.currentSessionId) return []

  const title = active.title || DEFAULT_TITLE
  const mode = active.mode ?? "tailwindcss"
  const version = active.version ?? 1
  // 结构大纲嵌套在基线块内：模型据此选择 <front_design_update> 的 target，避免自由文本修改退化为全量重写。
  const outline = buildDesignOutline(active.html)
  const outlineBlock = outline ? `\n<design_outline>\n${outline}\n</design_outline>` : ""
  return [
    `<current_design id="${active.id}" title="${title}" mode="${mode}" version="${version}">\n${active.html}${outlineBlock}\n</current_design>`,
  ]
}
