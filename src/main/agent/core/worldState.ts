/**
 * WorldState 增量差分与动态上下文管理系统 (WorldStateManager)
 *
 * 对齐 Codex `world_state` 架构：
 * 维护 Turn 间的状态快照（Environment, ContextWindowGuidance, MultiAgent, Permissions 等），
 * 仅在状态发生变化时计算并渲染增量差异片段（`renderDiff`），避免全量冗余注入。
 */

export interface WorldStateSection<T = unknown> {
  readonly id: string
  snapshot(): T
  renderDiff(previous: T | undefined): string | null
}

export class EnvironmentStateSection implements WorldStateSection<string> {
  public readonly id = "world:environment"

  constructor(
    private readonly env: {
      cwd: string
      gitBranch?: string
      isWorktree?: boolean
      platform?: string
    },
  ) {}

  public snapshot(): string {
    return JSON.stringify({
      cwd: this.env.cwd,
      gitBranch: this.env.gitBranch,
      isWorktree: this.env.isWorktree,
    })
  }

  public renderDiff(previous: string | undefined): string | null {
    const current = this.snapshot()
    if (previous === current) {
      return null
    }

    const lines: string[] = ["<env>"]
    lines.push(`  Working directory: ${this.env.cwd}`)
    if (this.env.gitBranch) {
      lines.push(`  Git branch: ${this.env.gitBranch}`)
    }
    if (this.env.isWorktree) {
      lines.push(`  Is git worktree: yes`)
    }
    if (this.env.platform) {
      lines.push(`  Platform: ${this.env.platform}`)
    }
    lines.push("</env>")
    return lines.join("\n")
  }
}

export class ContextWindowGuidanceSection implements WorldStateSection<string> {
  public readonly id = "world:context_window_guidance"

  constructor(
    private readonly usageRatio: number,
    private readonly isManualCompactAllowed: boolean = true,
  ) {}

  public snapshot(): string {
    const bracket = this.usageRatio > 0.85 ? "critical" : this.usageRatio > 0.65 ? "warning" : "nominal"
    return `${bracket}:${this.isManualCompactAllowed}`
  }

  public renderDiff(previous: string | undefined): string | null {
    const current = this.snapshot()
    if (previous === current) {
      return null
    }

    if (this.usageRatio > 0.85) {
      return [
        "<context_window_guidance>",
        "CRITICAL: Context usage is above 85% capacity. Keep your outputs extremely concise.",
        "Avoid repetitive file reads and consolidate multi-file edits into single batches.",
        "</context_window_guidance>",
      ].join("\n")
    }

    if (this.usageRatio > 0.65) {
      return [
        "<context_window_guidance>",
        "NOTE: Context usage is above 65%. Be selective with file reading and avoid dumping large unneeded contents.",
        "</context_window_guidance>",
      ].join("\n")
    }

    return null
  }
}

export class WorldStateManager {
  private readonly sectionSnapshots = new Map<string, unknown>()

  public computeDiffs(sections: WorldStateSection[]): string[] {
    const diffs: string[] = []

    for (const section of sections) {
      const previous = this.sectionSnapshots.get(section.id)
      const diff = section.renderDiff(previous)
      if (diff) {
        diffs.push(diff)
      }
      this.sectionSnapshots.set(section.id, section.snapshot())
    }

    return diffs
  }

  public reset(): void {
    this.sectionSnapshots.clear()
  }
}
