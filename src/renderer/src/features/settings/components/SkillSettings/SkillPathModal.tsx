import { useEffect, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxModal } from "@/components/ui/LxModal"
import { useTranslation } from "@/i18n"

// 路径输入弹窗属性（新建文件 / 重命名 / 复制为）。
export interface SkillPathModalProps {
  isOpen: boolean
  title: string
  initialValue: string
  placeholder: string
  validate: (value: string) => string | null
  onClose: () => void
  onConfirm: (value: string) => void
}

/**
 * 渲染 Skill 相对路径输入弹窗（校验失败时内联提示，不关闭）。
 */
export const SkillPathModal = ({
  isOpen,
  title,
  initialValue,
  placeholder,
  validate,
  onClose,
  onConfirm,
}: SkillPathModalProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue)
      setError(null)
    }
  }, [isOpen, initialValue])

  const handleConfirm = (): void => {
    const trimmed = value.trim()
    const validationError = validate(trimmed)
    if (validationError) {
      setError(validationError)
      return
    }
    onConfirm(trimmed)
  }

  return (
    <LxModal isOpen={isOpen} onClose={onClose} title={title} width="420px">
      <div className="flex flex-col gap-3 text-xs text-white/80">
        <LxInput
          autoFocus
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
        />
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-2">
          <LxIconButton
            iconOnly={false}
            aria-label={t("common.cancel")}
            onClick={onClose}
            className="rounded-[6px] border border-white/10 text-white/70"
          >
            <span className="text-xs">{t("common.cancel")}</span>
          </LxIconButton>
          <LxIconButton
            iconOnly={false}
            aria-label={t("common.confirm")}
            onClick={handleConfirm}
            className="rounded-[6px] border border-white/10 bg-white/10 font-medium text-white"
          >
            <span className="text-xs">{t("common.confirm")}</span>
          </LxIconButton>
        </div>
      </div>
    </LxModal>
  )
}
