// 预览运行时错误采集：iframe 内守卫脚本 + 父层读取与去重。

import type { PreviewIssue } from "@/pages/front-design/types"

// iframe 内错误缓冲挂载的全局键名。
export const PREVIEW_ERRORS_GLOBAL = "__lxPreviewErrors"

// 守卫脚本节点 id。
export const PREVIEW_ERROR_GUARD_ID = "lx-preview-error-guard"

// 帧内缓冲上限与父层展示上限。
export const MAX_GUARDED_ERRORS = 50
export const MAX_DISPLAYED_ERRORS = 10

// 单字段截断，避免超长堆栈撑爆消息。
const MAX_MESSAGE_LENGTH = 600
const MAX_SOURCE_LENGTH = 200
const MAX_DETAIL_LENGTH = 1200

// 采集到的原始错误记录。
export interface RawPreviewError {
  level: "error" | "console"
  message: string
  source: string
  detail: string
}

/**
 * 注入到 `<head>` 顶部的采集守卫：onerror / unhandledrejection / console.error 统一入栈。
 * 资源加载错误（img / script / link）不采集，噪音不可控。
 */
export const buildPreviewErrorGuardScript = (): string =>
  `<script id="${PREVIEW_ERROR_GUARD_ID}">(function(){var buffer=[];try{window.${PREVIEW_ERRORS_GLOBAL}=buffer;}catch(e){return;}function push(level,message,source,detail){try{buffer.push({level:level,message:String(message==null?"":message).slice(0,${MAX_MESSAGE_LENGTH}),source:String(source||"").slice(0,${MAX_SOURCE_LENGTH}),detail:String(detail||"").slice(0,${MAX_DETAIL_LENGTH})});if(buffer.length>${MAX_GUARDED_ERRORS})buffer.splice(0,buffer.length-${MAX_GUARDED_ERRORS});}catch(e){}}window.addEventListener("error",function(event){var target=event&&event.target;if(target&&target!==window&&target.tagName)return;var location=event&&event.filename?event.filename+":"+event.lineno+":"+event.colno:"";push("error",(event&&event.message)||"Script error",location,event&&event.error&&event.error.stack);},true);window.addEventListener("unhandledrejection",function(event){var reason=event&&event.reason;push("error",(reason&&reason.message)||String(reason),"unhandledrejection",reason&&reason.stack);});var originalError=console.error;console.error=function(){var parts=[];for(var i=0;i<arguments.length;i++){var arg=arguments[i];parts.push(arg&&arg.message?arg.message:String(arg));}push("console",parts.join(" "),"console.error","");if(originalError)originalError.apply(console,arguments);};})();</script>`

const isRawPreviewError = (value: unknown): value is RawPreviewError => {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<RawPreviewError>
  return (
    (candidate.level === "error" || candidate.level === "console") &&
    typeof candidate.message === "string"
  )
}

/**
 * 读取 iframe 文档内的错误缓冲；文档不可用或数据非法时返回空数组。
 */
export const readPreviewErrors = (doc: Document | null | undefined): RawPreviewError[] => {
  if (!doc) return []
  try {
    const holder = doc.defaultView as unknown as Record<string, unknown> | null
    const buffer = holder?.[PREVIEW_ERRORS_GLOBAL]
    if (!Array.isArray(buffer)) return []
    return buffer.filter(isRawPreviewError)
  } catch {
    return []
  }
}

/**
 * 归一化并去重错误缓冲：同 message + source 合并计数，count 取缓冲内分组长度（重复轮询幂等）。
 */
export const mergePreviewErrors = (
  raw: RawPreviewError[],
  format: (sample: RawPreviewError) => {
    message: string
    instruction: string
    detail?: string
  },
): PreviewIssue[] => {
  const groups = new Map<string, { sample: RawPreviewError; count: number }>()
  for (const item of raw) {
    const key = `${item.message}|${item.source}`
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
    } else {
      groups.set(key, { sample: item, count: 1 })
    }
  }

  return Array.from(groups.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, MAX_DISPLAYED_ERRORS)
    .map(([key, group]) => {
      const formatted = format(group.sample)
      return {
        id: `runtime:${key}`,
        group: "runtime" as const,
        level: group.sample.level === "error" ? ("error" as const) : ("warning" as const),
        message: formatted.message,
        instruction: formatted.instruction,
        detail: formatted.detail,
        count: group.count,
      }
    })
}
