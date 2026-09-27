import type React from "react"

import { LxCodeBlock } from "@/components/ui/LxCodeBlock"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

const TYPE_SCRIPT_SAMPLE = [
  "interface DateRange {",
  "  startDate: string",
  "  endDate: string",
  "}",
  "",
  "export const contains = (range: DateRange, dateKey: string): boolean =>",
  "  dateKey >= range.startDate && dateKey <= range.endDate",
].join("\n")

const JSON_SAMPLE = [
  "{",
  '  "name": "lx-agent",',
  '  "private": true,',
  '  "scripts": {',
  '    "dev": "electron-vite dev",',
  '    "test": "vitest run"',
  "  }",
  "}",
].join("\n")

const BASH_SAMPLE = ["pnpm install", "pnpm dev", "pnpm test"].join("\n")

/**
 * 预览 LxCodeBlock 组件。
 */
export const LxCodeBlockDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.codeBlockBasic")}
        description={t("uiPreview.demos.codeBlockBasicDesc")}
      >
        <LxCodeBlock code={TYPE_SCRIPT_SAMPLE} language="typescript" />
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.codeBlockCollapsed")}
        description={t("uiPreview.demos.codeBlockCollapsedDesc")}
      >
        <LxCodeBlock code={JSON_SAMPLE} language="json" defaultCollapsed />
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.codeBlockStatic")}
        description={t("uiPreview.demos.codeBlockStaticDesc")}
      >
        <LxCodeBlock code={BASH_SAMPLE} language="bash" collapsible={false} />
      </UiPreviewSection>
    </div>
  )
}
