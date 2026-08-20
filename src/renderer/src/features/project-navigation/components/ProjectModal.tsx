import type React from "react"
import { useEffect, useState } from "react"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxModal } from "@/components/ui/LxModal"
import { useTranslation } from "@/i18n"

// 项目弹窗模式。
export type ProjectModalMode = "create" | "edit"

// 项目表单值。
export type ProjectModalValues = {
  name: string
  path?: string
}

// 编辑项目的初始数据。
export interface ProjectModalProject {
  name: string
  path?: string
}

// 项目弹窗属性。
interface ProjectModalProps {
  isOpen: boolean
  mode: ProjectModalMode
  project?: ProjectModalProject
  onClose: () => void
  onSubmit: (values: ProjectModalValues) => Promise<void>
}

/**
 * 统一处理项目创建与编辑的名称、路径表单。
 */
export const ProjectModal = ({
  isOpen,
  mode,
  project,
  onClose,
  onSubmit,
}: ProjectModalProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [name, setName] = useState<string>("")
  const [path, setPath] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const isEditMode = mode === "edit"

  useEffect(() => {
    if (!isOpen) return

    setName(project?.name ?? "")
    setPath(project?.path ?? "")
    setIsSubmitting(false)
  }, [isOpen, project])

  /**
   * 校验名称后提交项目表单。
   */
  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || isSubmitting) return

    setIsSubmitting(true)

    try {
      await onSubmit({ name: trimmedName, path: path.trim() || undefined })
    } catch {
      setIsSubmitting(false)
    }
  }

  return (
    <LxModal
      isOpen={isOpen}
      title={isEditMode ? t("project.editProject") : t("project.newProject")}
      onClose={onClose}
    >
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-xs font-semibold text-white/55">
          {t("project.projectName")}
          <LxInput
            autoFocus
            required
            aria-label={t("project.projectName")}
            placeholder={t("project.inputProjectName")}
            size="sm"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-white/55">
          {t("project.projectPathOptional")}
          <LxInput
            aria-label={t("project.projectPathOptional")}
            placeholder={t("project.projectPathPlaceholder")}
            size="sm"
            value={path}
            onChange={(event) => setPath(event.target.value)}
          />
        </label>
        <div className="mt-1 flex justify-end gap-1.5">
          <LxIconButton
            aria-label={
              isEditMode
                ? t("project.cancelEditProject")
                : t("project.cancelCreateProject")
            }
            preset="close"
            size="small"
            disabled={isSubmitting}
            onClick={onClose}
          />
          <LxIconButton
            aria-label={
              isEditMode
                ? t("project.confirmEditProject")
                : t("project.confirmCreateProject")
            }
            preset="confirm"
            size="small"
            type="submit"
            disabled={isSubmitting}
          />
        </div>
      </form>
    </LxModal>
  )
}
