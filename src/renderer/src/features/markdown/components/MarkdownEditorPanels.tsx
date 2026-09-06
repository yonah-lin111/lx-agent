import React from "react"
import { GitWorktreeCommandMenu } from "@/features/git"
import { FileMentionCommandMenu } from "@/features/markdown/components/FileMentionCommandMenu"
import { MarkdownBlockCommandMenu } from "@/features/markdown/components/MarkdownBlockCommandMenu"
import {
  buildPasteReferenceOptions,
  MarkdownPasteCommandMenu,
} from "@/features/markdown/components/MarkdownPasteCommandMenu"
import { MarkdownSendPromptCommandMenu } from "@/features/markdown/components/MarkdownSendPromptCommandMenu"
import { MarkdownSendPromptFlagCommandMenu } from "@/features/markdown/components/MarkdownSendPromptFlagCommandMenu"
import { MarkdownSlashCommandMenu } from "@/features/markdown/components/MarkdownSlashCommandMenu"
import type { useTranslation } from "@/i18n"

export interface MarkdownEditorPanelsProps {
  pasteReferencePanel: {
    from: number
    to: number
    insertion: string
    referenceInsertion: string
    originalText: string
    paths: { path: string; type: "folder" | "file" | "image" }[]
    position: { left: number; top: number | string; bottom: number | string }
  } | null
  activePasteReferenceIndex: number
  blockCommandPanel: any
  activeBlockCommandIndex: number
  slashCommandPanel: any
  activeSlashCommandIndex: number
  gitWorktreePanel: any
  activeGitWorktreeIndex: number
  sendPromptPanel: any
  activeSendPromptIndex: number
  sendPromptFlagPanel: any
  activeSendPromptFlagIndex: number
  fileMentionPanel: any
  activeFileMentionIndex: number
  templateFilePanel: any
  activeTemplateFileIndex: number
  t: ReturnType<typeof useTranslation>["t"]
}

export const MarkdownEditorPanels = ({
  pasteReferencePanel,
  activePasteReferenceIndex,
  blockCommandPanel,
  activeBlockCommandIndex,
  slashCommandPanel,
  activeSlashCommandIndex,
  gitWorktreePanel,
  activeGitWorktreeIndex,
  sendPromptPanel,
  activeSendPromptIndex,
  sendPromptFlagPanel,
  activeSendPromptFlagIndex,
  fileMentionPanel,
  activeFileMentionIndex,
  templateFilePanel,
  activeTemplateFileIndex,
  t,
}: MarkdownEditorPanelsProps): React.JSX.Element => {
  return (
    <>
      <MarkdownPasteCommandMenu
        activeIndex={activePasteReferenceIndex}
        options={
          pasteReferencePanel ? buildPasteReferenceOptions(pasteReferencePanel.paths, t) : undefined
        }
        position={pasteReferencePanel?.position}
        visible={Boolean(pasteReferencePanel)}
      />
      <MarkdownBlockCommandMenu
        activeIndex={activeBlockCommandIndex}
        commands={blockCommandPanel?.commands}
        position={blockCommandPanel?.position}
        visible={Boolean(blockCommandPanel)}
      />
      <MarkdownSlashCommandMenu
        activeIndex={activeSlashCommandIndex}
        commands={slashCommandPanel?.commands}
        position={slashCommandPanel?.position}
        visible={Boolean(slashCommandPanel)}
      />
      <GitWorktreeCommandMenu
        activeIndex={activeGitWorktreeIndex}
        options={gitWorktreePanel?.options}
        position={gitWorktreePanel?.position}
        visible={Boolean(gitWorktreePanel)}
      />
      <MarkdownSendPromptCommandMenu
        activeIndex={activeSendPromptIndex}
        options={sendPromptPanel?.options}
        position={sendPromptPanel?.position}
        visible={Boolean(sendPromptPanel)}
      />
      <MarkdownSendPromptFlagCommandMenu
        activeIndex={activeSendPromptFlagIndex}
        options={sendPromptFlagPanel?.options}
        position={sendPromptFlagPanel?.position}
        visible={Boolean(sendPromptFlagPanel)}
      />
      <FileMentionCommandMenu
        activeIndex={activeFileMentionIndex}
        files={fileMentionPanel?.files}
        position={fileMentionPanel?.position}
        visible={Boolean(fileMentionPanel)}
      />
      <FileMentionCommandMenu
        activeIndex={activeTemplateFileIndex}
        files={templateFilePanel?.files}
        idPrefix="markdown-template-file"
        label="模板块文件快捷输入"
        position={templateFilePanel?.position}
        visible={Boolean(templateFilePanel)}
      />
    </>
  )
}
