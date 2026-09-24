import type { CollaborationMode } from "@shared/contracts/agent"
import type { LucideIcon } from "lucide-react"
import { Compass, Palette, ShieldAlert, Terminal, Workflow, Zap } from "lucide-react"
import type { LxTagColor } from "@/components/ui/LxTag"
import type { TranslationKey } from "@/i18n"

// 协作模式展示元数据（状态栏指示、模式选择弹层与设置页共用）。
export const COLLABORATION_MODE_META: Record<
  CollaborationMode,
  {
    // 状态栏短名（英文稳定值）。
    shortName: string
    labelKey: TranslationKey
    descKey: TranslationKey
    color: LxTagColor
    // 图标颜色类（脱离 LxTag 色板时使用）。
    iconClass: string
    Icon: LucideIcon
  }
> = {
  build: {
    shortName: "Build",
    labelKey: "agent.collaborationModeBuild",
    descKey: "agent.collaborationModeBuildDesc",
    color: "default",
    iconClass: "text-white/45",
    Icon: Zap,
  },
  auto: {
    shortName: "Auto",
    labelKey: "agent.collaborationModeAuto",
    descKey: "agent.collaborationModeAutoDesc",
    color: "indigo",
    iconClass: "text-indigo-400/80",
    Icon: Workflow,
  },
  plan: {
    shortName: "Plan",
    labelKey: "agent.collaborationModePlan",
    descKey: "agent.collaborationModePlanDesc",
    color: "sky",
    iconClass: "text-sky-400/80",
    Icon: Compass,
  },
  review: {
    shortName: "Review",
    labelKey: "agent.collaborationModeReview",
    descKey: "agent.collaborationModeReviewDesc",
    color: "purple",
    iconClass: "text-purple-400/80",
    Icon: ShieldAlert,
  },
  design: {
    shortName: "Design",
    labelKey: "agent.collaborationModeDesign",
    descKey: "agent.collaborationModeDesignDesc",
    color: "pink",
    iconClass: "text-pink-400/80",
    Icon: Palette,
  },
  minimal: {
    shortName: "Minimal",
    labelKey: "agent.collaborationModeMinimal",
    descKey: "agent.collaborationModeMinimalDesc",
    color: "emerald",
    iconClass: "text-emerald-400/80",
    Icon: Terminal,
  },
}
