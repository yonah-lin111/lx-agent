import { Check, Copy, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { LxMenu, LxMenuSeparator } from "@/components/ui/LxMenu"
import { LxMenuItem } from "@/components/ui/LxMenuItem"
import { useTranslation } from "@/i18n"
import type { ModelProviderMenuProps } from "../types"

/**
 * 渲染模型 Provider 右键操作菜单。
 */
export const ModelProviderMenu = ({
  isOpen,
  providerName,
  isEnabled,
  x,
  y,
  anchor,
  onToggleEnabled,
  onDuplicate,
  onDelete,
  onClose,
}: ModelProviderMenuProps): React.JSX.Element | null => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false)
  const [lastMenu, setLastMenu] = useState({ providerName, isEnabled, x, y })
  const { t } = useTranslation()

  const displayedMenu = isOpen ? { providerName, isEnabled, x, y } : lastMenu

  useEffect(() => {
    if (isOpen) setLastMenu({ providerName, isEnabled, x, y })
  }, [isOpen, providerName, isEnabled, x, y])

  useEffect(() => {
    setIsConfirmingDelete(false)
  }, [isOpen, providerName])

  const handleDeleteClick = (): void => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true)
      return
    }
    onDelete()
  }

  return (
    <LxMenu
      ariaLabel={t("settings.providerMenu", { name: displayedMenu.providerName })}
      anchor={anchor ?? null}
      isOpen={isOpen}
      x={displayedMenu.x}
      y={displayedMenu.y}
      onClose={onClose}
    >
      <LxMenuItem
        aria-checked={displayedMenu.isEnabled}
        leading={<span className="h-2 w-2 rounded-full bg-emerald-400/80" />}
        menuRole="menuitemradio"
        onClick={() => {
          onToggleEnabled(true)
          onClose()
        }}
        trailing={displayedMenu.isEnabled ? <Check className="h-3.5 w-3.5 text-white/70" /> : null}
      >
        {t("common.enable")}
      </LxMenuItem>
      <LxMenuItem
        aria-checked={!displayedMenu.isEnabled}
        leading={<span className="h-2 w-2 rounded-full bg-white/40" />}
        menuRole="menuitemradio"
        onClick={() => {
          onToggleEnabled(false)
          onClose()
        }}
        trailing={!displayedMenu.isEnabled ? <Check className="h-3.5 w-3.5 text-white/70" /> : null}
      >
        {t("common.disable")}
      </LxMenuItem>
      <LxMenuSeparator />
      <LxMenuItem
        leading={<Copy className="h-3.5 w-3.5 text-white/70" />}
        onClick={() => {
          onDuplicate()
          onClose()
        }}
      >
        {t("settings.duplicateProvider")}
      </LxMenuItem>
      <LxMenuItem
        active={isConfirmingDelete}
        danger
        leading={
          <Trash2
            className={`h-3.5 w-3.5 ${isConfirmingDelete ? "text-white" : "text-rose-400/80"}`}
          />
        }
        onClick={handleDeleteClick}
      >
        {isConfirmingDelete ? t("settings.confirmDeleteProvider") : t("settings.deleteProvider")}
      </LxMenuItem>
    </LxMenu>
  )
}
