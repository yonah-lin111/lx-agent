// @vitest-environment jsdom

import type { SkillItem } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  type AgentInputCommand,
  AgentInputCommandPanel,
  AgentInputFilePanel,
  type AgentInputModel,
  AgentInputModelPanel,
  type AgentInputProjectItem,
  AgentInputProjectPanel,
  type AgentInputSessionItem,
  AgentInputSessionPanel,
  type AgentMentionItem,
  AgentSkillMentionPanel,
  AgentUndoConfirmPanel,
} from "@/features/agent/components/AgentInput/AgentInputCommandPanels"

const position = { top: 10, left: 10 }

const commands: AgentInputCommand[] = [
  { id: "clear", name: "/clear", description: "Clear session", kind: "builtin" },
  { id: "model", name: "/model", description: "Switch model", kind: "builtin" },
]

const models: AgentInputModel[] = [
  { id: "gpt-5", label: "GPT-5", provider: "openai" },
  { id: "claude", label: "Claude", provider: "anthropic" },
]

const projects: AgentInputProjectItem[] = [
  { id: "p1", name: "Project A", path: "/repo/a", isCurrent: true },
  { id: "p2", name: "Project B", path: "/repo/b" },
]

const sessions: AgentInputSessionItem[] = [
  { id: "s1", title: "Session A", cwd: "/repo/a", updatedAt: new Date().toISOString() },
  { id: "s2", title: "Session B", cwd: "/repo/b", updatedAt: new Date().toISOString() },
]

const mentionItems: AgentMentionItem[] = [
  { kind: "file", file: { path: "/repo/src/a.ts", isDirectory: false } },
  { kind: "file", file: { path: "/repo/src/b.ts", isDirectory: false } },
]

const subagentItem: AgentMentionItem = {
  kind: "subagent",
  subagent: { name: "explorer", description: "Explore the codebase", builtIn: true },
}

const skills: SkillItem[] = [
  {
    name: "review",
    description: "Review code",
    filePath: "/skills/review.md",
    baseDir: "/skills",
    disableModelInvocation: false,
  },
  {
    name: "debug",
    description: "Debug code",
    filePath: "/skills/debug.md",
    baseDir: "/skills",
    disableModelInvocation: false,
  },
]

describe("AgentInput 命令面板鼠标点选交互", () => {
  afterEach(() => {
    cleanup()
  })

  it("命令面板：点选命令触发 onSelect", () => {
    const onSelect = vi.fn()
    render(
      <AgentInputCommandPanel
        isOpen={true}
        position={position}
        commands={commands}
        activeIndex={0}
        onSelect={onSelect}
      />,
    )

    fireEvent.mouseDown(screen.getByRole("option", { name: /\/model/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(commands[1])
  })

  it("模型面板：点选模型触发 onSelect，悬停不改变键盘激活项", () => {
    const onSelect = vi.fn()
    render(
      <AgentInputModelPanel
        isOpen={true}
        position={position}
        models={models}
        activeIndex={0}
        onSelect={onSelect}
      />,
    )

    const options = screen.getAllByRole("option")
    fireEvent.mouseEnter(options[1])
    expect(options[0].getAttribute("aria-selected")).toBe("true")
    expect(options[1].getAttribute("aria-selected")).toBe("false")

    fireEvent.mouseDown(options[1])
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(models[1])
  })

  it("项目面板：点选项目触发 onSelect", () => {
    const onSelect = vi.fn()
    render(
      <AgentInputProjectPanel
        isOpen={true}
        position={position}
        projects={projects}
        activeIndex={0}
        onSelect={onSelect}
      />,
    )

    fireEvent.mouseDown(screen.getByRole("option", { name: /Project B/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(projects[1])
  })

  it("会话面板：点选会话触发 onSelect", () => {
    const onSelect = vi.fn()
    render(
      <AgentInputSessionPanel
        isOpen={true}
        position={position}
        sessions={sessions}
        activeIndex={0}
        onSelect={onSelect}
      />,
    )

    fireEvent.mouseDown(screen.getByRole("option", { name: /Session B/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(sessions[1])
  })

  it("文件提及面板：点选候选文件触发 onSelect", () => {
    const onSelect = vi.fn()
    render(
      <AgentInputFilePanel
        isOpen={true}
        position={position}
        items={mentionItems}
        activeIndex={0}
        onSelect={onSelect}
      />,
    )

    fireEvent.mouseDown(screen.getByRole("option", { name: /b\.ts/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(mentionItems[1])
  })

  it("子代理提及面板：渲染 @agent token、描述与 Agent 标签，点选触发 onSelect", () => {
    const onSelect = vi.fn()
    render(
      <AgentInputFilePanel
        isOpen={true}
        position={position}
        items={[subagentItem]}
        activeIndex={0}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByText("@agent:explorer")).toBeDefined()
    expect(screen.getByText("Explore the codebase")).toBeDefined()
    expect(screen.getByText("Agent")).toBeDefined()

    fireEvent.mouseDown(screen.getByRole("option", { name: /@agent:explorer/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(subagentItem)
  })

  it("Skill 提及面板：点选技能触发 onSelect", () => {
    const onSelect = vi.fn()
    render(
      <AgentSkillMentionPanel
        isOpen={true}
        position={position}
        skills={skills}
        activeIndex={0}
        onSelect={onSelect}
      />,
    )

    fireEvent.mouseDown(screen.getByRole("option", { name: /\$debug/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(skills[1])
  })

  it("undo 确认面板：点选项回传对应索引", () => {
    const onSelect = vi.fn()
    render(
      <AgentUndoConfirmPanel
        isOpen={true}
        position={position}
        activeIndex={0}
        onSelect={onSelect}
      />,
    )

    const options = screen.getAllByRole("option")
    fireEvent.mouseDown(options[1])
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
