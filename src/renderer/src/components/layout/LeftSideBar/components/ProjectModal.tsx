import type React from "react"
import { useEffect, useState } from "react"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxModal } from "@/components/ui/LxModal"

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
  onSubmit: (values: ProjectModalValues) => void
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
  const [name, setName] = useState<string>("")
  const [path, setPath] = useState<string>("")
  const isEditMode = mode === "edit"

  useEffect(() => {
    if (!isOpen) return

    setName(project?.name ?? "")
    setPath(project?.path ?? "")
  }, [isOpen, project])

  /**
   * 校验名称后提交项目表单。
   */
  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    onSubmit({ name: trimmedName, path: path.trim() || undefined })
  }

  return (
    <LxModal isOpen={isOpen} title={isEditMode ? "编辑项目" : "新建项目"} onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-xs font-semibold text-white/55">
          项目名称
          <LxInput
            autoFocus
            required
            aria-label="项目名称"
            placeholder="输入项目名称"
            size="xs"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-white/55">
          项目路径（可选）
          <LxInput
            aria-label="项目路径"
            placeholder="例如：/Users/name/project"
            size="xs"
            value={path}
            onChange={(event) => setPath(event.target.value)}
          />
        </label>
        <div className="mt-1 flex justify-end gap-1.5">
          <LxIconButton
            aria-label={isEditMode ? "取消编辑项目" : "取消创建项目"}
            preset="close"
            size="small"
            title={{ content: "取消", placement: "bottom" }}
            onClick={onClose}
          />
          <LxIconButton
            aria-label={isEditMode ? "确认编辑项目" : "确认创建项目"}
            preset="confirm"
            size="small"
            title={{ content: isEditMode ? "保存项目" : "创建项目", placement: "bottom" }}
            type="submit"
          />
        </div>
      </form>
    </LxModal>
  )
}
