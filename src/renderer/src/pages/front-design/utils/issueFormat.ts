// 体检问题文案格式化：把审计发现与运行时错误翻译为展示文案与回流指令。

import type { TranslationKey } from "@/i18n"
import type { A11yFinding, A11yRuleId, PreviewIssue } from "@/pages/front-design/types"
import type { RawPreviewError } from "@/pages/front-design/utils/previewGuard"

// 翻译函数签名（与 useTranslation 的 t 对齐）。
export type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

const RULE_MESSAGE_KEYS: Record<A11yRuleId, TranslationKey> = {
  alt: "frontDesign.issuesRuleAlt",
  "accessible-name": "frontDesign.issuesRuleAccessibleName",
  contrast: "frontDesign.issuesRuleContrast",
  "target-size": "frontDesign.issuesRuleTargetSize",
  "form-label": "frontDesign.issuesRuleFormLabel",
  lang: "frontDesign.issuesRuleLang",
}

const RULE_INSTRUCTION_KEYS: Record<A11yRuleId, TranslationKey> = {
  alt: "frontDesign.issuesInstructionAlt",
  "accessible-name": "frontDesign.issuesInstructionAccessibleName",
  contrast: "frontDesign.issuesInstructionContrast",
  "target-size": "frontDesign.issuesInstructionTargetSize",
  "form-label": "frontDesign.issuesInstructionFormLabel",
  lang: "frontDesign.issuesInstructionLang",
}

const buildParams = (finding: A11yFinding): Record<string, string | number> => {
  const values = finding.values ?? {}
  return {
    ratio: values.ratio ?? "",
    threshold: values.threshold ?? "",
    width: values.width ?? "",
    height: values.height ?? "",
    min: values.min ?? 24,
  }
}

/**
 * 把审计发现格式化为面板文案与回流指令。
 */
export const formatA11yFinding = (finding: A11yFinding, t: Translate): PreviewIssue => {
  const params = buildParams(finding)
  return {
    id: `a11y:${finding.rule}:${finding.selector ?? "document"}`,
    group: "a11y",
    level: finding.level,
    rule: finding.rule,
    message: t(RULE_MESSAGE_KEYS[finding.rule], params),
    instruction: t(RULE_INSTRUCTION_KEYS[finding.rule], params),
    selector: finding.selector,
    count: 1,
  }
}

/**
 * 把运行时错误格式化为面板文案与回流指令。
 */
export const formatRuntimeError = (
  sample: RawPreviewError,
  t: Translate,
): { message: string; instruction: string; detail?: string } => {
  const message = sample.source ? `${sample.message} (${sample.source})` : sample.message
  return {
    message,
    instruction: `${t("frontDesign.issuesInstructionRuntime")}: ${message}`,
    detail: sample.detail || undefined,
  }
}
