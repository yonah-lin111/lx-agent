import type { CustomCommandBlockType, CustomCommandType } from "@shared/contracts/customCommand"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxInput } from "@/components/ui/LxInput"
import { LxSelect } from "@/components/ui/LxSelect"
import { useTranslation } from "@/i18n"

// 自定义命令表单状态。
export interface CustomCommandFormState {
  name: string
  description: string
  content: string
  argumentHint: string
  mdScope: "global" | "template"
  blockType: CustomCommandBlockType
  title: string
}

export const DEFAULT_CUSTOM_COMMAND_FORM: CustomCommandFormState = {
  name: "",
  description: "",
  content: "",
  argumentHint: "",
  mdScope: "global",
  blockType: "template",
  title: "",
}

interface CommandMetaFieldsProps {
  activeTab: CustomCommandType
  formData: CustomCommandFormState
  onChange: (updater: (prev: CustomCommandFormState) => CustomCommandFormState) => void
}

/**
 * 渲染自定义命令的元数据字段区（名称、描述、插入作用域与参数提示）。
 */
export const CommandMetaFields = ({
  activeTab,
  formData,
  onChange,
}: CommandMetaFieldsProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="grid shrink-0 gap-3 border-b border-white/8 pb-3 @[500px]:grid-cols-2">
      <label className="grid gap-1 text-xs text-white/60">
        <span className="flex items-center gap-1">
          {t("settings.customCommandName")}
          <span className="text-rose-400">*</span>
        </span>
        <LxInput
          placeholder="e.g. reviewCode"
          prefix={<span className="text-white/40 font-mono">/</span>}
          value={formData.name}
          onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))}
        />
      </label>

      <label className="grid gap-1 text-xs text-white/60">
        <span>{t("settings.customCommandDescription")}</span>
        <LxInput
          placeholder={t("settings.customCommandDescriptionPlaceholder")}
          value={formData.description}
          onChange={(event) => onChange((prev) => ({ ...prev, description: event.target.value }))}
        />
      </label>

      {activeTab === "agentBlock" ? (
        <>
          <label className="grid gap-1 text-xs text-white/60">
            <span>{t("settings.customCommandBlockType")}</span>
            <LxSelect
              value={formData.blockType}
              options={[
                { value: "template", label: t("settings.customCommandBlockTemplateName") },
                { value: "supple", label: t("settings.customCommandBlockSuppleName") },
                { value: "log", label: t("settings.customCommandBlockLogName") },
              ]}
              onChange={(value) =>
                onChange((prev) => ({
                  ...prev,
                  blockType: value as CustomCommandBlockType,
                }))
              }
            />
          </label>

          <label className="grid gap-1 text-xs text-white/60">
            <span>{t("settings.customCommandBlockTitle")}</span>
            <LxInput
              placeholder={t("settings.customCommandBlockTitlePlaceholder")}
              value={formData.title}
              onChange={(event) => onChange((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>
        </>
      ) : activeTab === "agentInput" ? (
        <label className="grid gap-1 text-xs text-white/60 @[500px]:col-span-2">
          <span className="flex items-center gap-1">
            {t("settings.customCommandArgumentHint")}
            <LxInfoTooltip
              markdown={`\`argument-hint\`: ${t("settings.customCommandArgumentHintHelp")}`}
            />
          </span>
          <LxInput
            placeholder="e.g. [feature] [branch]"
            value={formData.argumentHint}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, argumentHint: event.target.value }))
            }
          />
        </label>
      ) : (
        <>
          <label className="grid gap-1 text-xs text-white/60">
            <span className="flex items-center gap-1">
              {t("settings.customCommandMDScope")}
              <LxInfoTooltip
                markdown={`**global**: ${t("settings.customCommandMDGlobalScopeDesc")}\n\n**template**: ${t("settings.customCommandMDTemplateScopeDesc")}`}
              />
            </span>
            <LxSelect
              value={formData.mdScope}
              options={[
                { value: "global", label: t("settings.customCommandScopeGlobal") },
                {
                  value: "template",
                  label: t("settings.customCommandScopeTemplateOnly"),
                },
              ]}
              onChange={(value) =>
                onChange((prev) => ({
                  ...prev,
                  mdScope: value as "global" | "template",
                }))
              }
            />
          </label>

          <label className="grid gap-1 text-xs text-white/60">
            <span className="flex items-center gap-1">
              {t("settings.customCommandArgumentHint")}
              <LxInfoTooltip
                markdown={`\`argument-hint\`: ${t("settings.customCommandArgumentHintHelp")}`}
              />
            </span>
            <LxInput
              placeholder="e.g. [feature] [branch]"
              value={formData.argumentHint}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, argumentHint: event.target.value }))
              }
            />
          </label>
        </>
      )}
    </div>
  )
}
