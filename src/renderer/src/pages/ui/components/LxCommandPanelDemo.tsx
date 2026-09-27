import { FileText, FolderOpen, Play, Search, Settings, Sparkles } from "lucide-react"
import type React from "react"
import { useRef, useState } from "react"

import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import type { TranslationKey } from "@/i18n"
import { useTranslation } from "@/i18n"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

// 演示命令项。
interface DemoCommand {
  id: string
  labelKey: TranslationKey
  icon: React.ComponentType<{ className?: string }>
}

const DEMO_COMMANDS: DemoCommand[] = [
  { id: "new-file", labelKey: "uiPreview.demos.mock.commandPanel.newFile", icon: FileText },
  { id: "open-folder", labelKey: "uiPreview.demos.mock.commandPanel.openFolder", icon: FolderOpen },
  { id: "search-files", labelKey: "uiPreview.demos.mock.commandPanel.searchFiles", icon: Search },
  { id: "run-command", labelKey: "uiPreview.demos.mock.commandPanel.runCommand", icon: Play },
  {
    id: "model-settings",
    labelKey: "uiPreview.demos.mock.commandPanel.modelSettings",
    icon: Settings,
  },
  { id: "generate", labelKey: "uiPreview.demos.mock.commandPanel.generate", icon: Sparkles },
]

/**
 * 预览 LxCommandPanel 组件：自建最小键盘宿主演示壳的交互能力。
 */
export const LxCommandPanelDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)

  const commands = DEMO_COMMANDS.map((command) => ({
    ...command,
    label: t(command.labelKey),
  }))

  const openPanel = (): void => {
    setIsOpen(true)
    setActiveIndex(0)
    hostRef.current?.focus()
  }

  const handleSelect = (index: number): void => {
    setSelectedLabel(commands[index]?.label ?? null)
    setIsOpen(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!isOpen) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault()
        openPanel()
      }
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % commands.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + commands.length) % commands.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      handleSelect(activeIndex)
    } else if (event.key === "Escape") {
      event.preventDefault()
      setIsOpen(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.commandPanelTitle")}
        description={t("uiPreview.demos.commandPanelDesc")}
      >
        <div
          ref={hostRef}
          tabIndex={-1}
          className="relative flex flex-col gap-2 outline-none"
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center gap-2">
            <UiActionButton onClick={() => (isOpen ? setIsOpen(false) : openPanel())}>
              {t("uiPreview.demos.openCommandPanel")}
            </UiActionButton>
            <span className="text-xs text-white/40">{t("uiPreview.demos.commandPanelHint")}</span>
          </div>
          {selectedLabel ? (
            <p className="text-xs text-white/55">
              {t("uiPreview.demos.commandPanelSelected", { value: selectedLabel })}
            </p>
          ) : null}
          <LxCommandPanel
            visible={isOpen}
            data={{ position: { left: 0, top: 56 }, activeIndex }}
            ariaLabel={t("uiPreview.demos.commandPanelAria")}
            className="absolute z-20 w-56 rounded-[6px] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-1 shadow-lg"
            ariaActiveDescendant={(data) => `demo-command-${data.activeIndex}`}
          >
            {(data) => (
              <div className="custom-scrollbar flex max-h-60 flex-col gap-0.5 overflow-y-auto">
                {commands.map((command, index) => {
                  const Icon = command.icon
                  return (
                    <LxCommandPanelItem
                      key={command.id}
                      id={`demo-command-${index}`}
                      index={index}
                      active={index === data.activeIndex}
                      onSelect={() => handleSelect(index)}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs"
                      leading={<Icon className="h-3.5 w-3.5 shrink-0 text-white/45" />}
                    >
                      {command.label}
                    </LxCommandPanelItem>
                  )
                })}
              </div>
            )}
          </LxCommandPanel>
        </div>
      </UiPreviewSection>
    </div>
  )
}
