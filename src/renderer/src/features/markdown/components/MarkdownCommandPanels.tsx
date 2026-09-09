import { GitWorktreeCommandMenu } from "@/features/git"
import { FileMentionCommandMenu } from "@/features/markdown/components/FileMentionCommandMenu"
import { MarkdownBlockCommandMenu } from "@/features/markdown/components/MarkdownBlockCommandMenu"
import { MarkdownColonCommandMenu } from "@/features/markdown/components/MarkdownColonCommandMenu"
import {
  buildPasteReferenceOptions,
  MarkdownPasteCommandMenu,
} from "@/features/markdown/components/MarkdownPasteCommandMenu"
import { MarkdownSendPromptCommandMenu } from "@/features/markdown/components/MarkdownSendPromptCommandMenu"
import { MarkdownSendPromptFlagCommandMenu } from "@/features/markdown/components/MarkdownSendPromptFlagCommandMenu"
import { MarkdownSlashCommandMenu } from "@/features/markdown/components/MarkdownSlashCommandMenu"
import { MarkdownVariableCommandMenu } from "@/features/markdown/components/MarkdownVariableCommandMenu"
import { TemplatePresetCommandMenu } from "@/features/markdown/components/TemplatePresetCommandMenu"
import type { useMarkdownPanels } from "@/features/markdown/hooks/useMarkdownPanels"
import type { UseMarkdownPasteReferenceResult } from "@/features/markdown/hooks/useMarkdownPasteReference"

import type { TranslationKey } from "@/i18n"

export interface MarkdownCommandPanelsProps {
  paste: UseMarkdownPasteReferenceResult
  panels: ReturnType<typeof useMarkdownPanels>
  t: (key: TranslationKey, options?: Record<string, string | number>) => string
}

/**
 * 渲染 Markdown 编辑器的快捷菜单、斜杠命令与自动补全悬浮面板集合。
 */
export const MarkdownCommandPanels = ({
  paste,
  panels,
  t,
}: MarkdownCommandPanelsProps): React.JSX.Element => {
  return (
    <>
      <MarkdownPasteCommandMenu
        activeIndex={paste.activePasteReferenceIndex}
        options={
          paste.pasteReferencePanel
            ? buildPasteReferenceOptions(paste.pasteReferencePanel.paths, t)
            : undefined
        }
        position={paste.pasteReferencePanel?.position}
        visible={Boolean(paste.pasteReferencePanel)}
      />
      <MarkdownBlockCommandMenu
        activeIndex={panels.activeBlockCommandIndex}
        commands={panels.blockCommandPanel?.commands}
        position={panels.blockCommandPanel?.position}
        visible={Boolean(panels.blockCommandPanel)}
      />
      <MarkdownSlashCommandMenu
        activeIndex={panels.activeSlashCommandIndex}
        commands={panels.slashCommandPanel?.commands}
        position={panels.slashCommandPanel?.position}
        visible={Boolean(panels.slashCommandPanel)}
      />
      <GitWorktreeCommandMenu
        activeIndex={panels.activeGitWorktreeIndex}
        options={panels.gitWorktreePanel?.options}
        position={panels.gitWorktreePanel?.position}
        visible={Boolean(panels.gitWorktreePanel)}
      />
      <TemplatePresetCommandMenu
        activeIndex={panels.activeTemplatePresetIndex}
        options={panels.templatePresetPanel?.options}
        position={panels.templatePresetPanel?.position}
        visible={Boolean(panels.templatePresetPanel)}
        onSelect={panels.selectTemplatePreset}
      />
      <MarkdownSendPromptCommandMenu
        activeIndex={panels.activeSendPromptIndex}
        options={panels.sendPromptPanel?.options}
        position={panels.sendPromptPanel?.position}
        visible={Boolean(panels.sendPromptPanel)}
      />
      <MarkdownSendPromptFlagCommandMenu
        activeIndex={panels.activeSendPromptFlagIndex}
        options={panels.sendPromptFlagPanel?.options}
        position={panels.sendPromptFlagPanel?.position}
        visible={Boolean(panels.sendPromptFlagPanel)}
      />
      <FileMentionCommandMenu
        activeIndex={panels.activeFileMentionIndex}
        files={panels.fileMentionPanel?.files}
        position={panels.fileMentionPanel?.position}
        visible={Boolean(panels.fileMentionPanel)}
      />
      <FileMentionCommandMenu
        activeIndex={panels.activeTemplateFileIndex}
        files={panels.templateFilePanel?.files}
        idPrefix="markdown-template-file"
        label="模板块文件快捷输入"
        position={panels.templateFilePanel?.position}
        visible={Boolean(panels.templateFilePanel)}
      />
      <MarkdownVariableCommandMenu
        activeIndex={panels.activeVariableIndex}
        position={panels.variablePanel?.position}
        triggerChar={panels.variablePanel?.triggerChar}
        variables={panels.variablePanel?.variables}
        visible={Boolean(panels.variablePanel)}
        onSelect={panels.selectVariable}
      />
      <MarkdownColonCommandMenu
        activeIndex={panels.activeColonOptionIndex}
        keyName={panels.colonPanel?.key ?? ""}
        position={panels.colonPanel?.position}
        visible={Boolean(panels.colonPanel?.active)}
        onSelect={(type) => panels.selectColonOption(type)}
      />
    </>
  )
}
