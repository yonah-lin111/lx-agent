import {
  Bot,
  Code2,
  FileCode,
  Folder,
  Globe,
  ListTodo,
  Palette,
  Search,
  Sparkles,
  Terminal,
} from "lucide-react"
import type React from "react"
import type { ExecutionToolContent } from "@/features/agent/types"

export interface FlowItemToolTitleProps {
  toolContent: ExecutionToolContent
}

export const FlowItemToolTitle = ({ toolContent }: FlowItemToolTitleProps): React.JSX.Element => {
  const toolName = toolContent.toolName

  if (toolName === "bash") {
    const cmd = typeof toolContent.args?.command === "string" ? toolContent.args.command.trim() : ""
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-amber-300">
          bash
        </span>
        {cmd && (
          <span className="flex min-w-0 flex-1 items-center gap-1 truncate font-mono text-[11px] leading-none text-white/60">
            <span className="shrink-0 text-white/30">$</span>
            <span className="truncate">{cmd}</span>
          </span>
        )}
      </div>
    )
  }

  if (toolName === "read" || toolName === "write" || toolName === "edit") {
    const filePath =
      typeof toolContent.args?.filePath === "string"
        ? toolContent.args.filePath
        : typeof toolContent.args?.path === "string"
          ? toolContent.args.path
          : ""
    const fileName = filePath ? filePath.split("/").pop() || filePath : ""
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-emerald-300">
          {toolName}
        </span>
        {fileName && (
          <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] leading-none text-white/60">
            <FileCode className="h-3 w-3 shrink-0 text-white/30" />
            <span className="truncate">{fileName}</span>
          </span>
        )}
        {toolContent.diff?.stats && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] leading-none">
            <span className="text-emerald-400">+{toolContent.diff.stats.added}</span>
            <span className="text-rose-400">-{toolContent.diff.stats.removed}</span>
          </span>
        )}
      </div>
    )
  }

  if (toolName === "grep" || toolName === "find") {
    const pattern =
      typeof toolContent.args?.pattern === "string" ? toolContent.args.pattern.trim() : ""
    const path = typeof toolContent.args?.path === "string" ? toolContent.args.path.trim() : ""
    const glob = typeof toolContent.args?.glob === "string" ? toolContent.args.glob.trim() : ""
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-sky-300">
          {toolName}
        </span>
        {pattern && (
          <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] leading-none text-white/60">
            <Search className="h-3 w-3 shrink-0 text-white/30" />
            <span className="truncate">"{pattern}"</span>
          </span>
        )}
        {glob && (
          <span className="hidden min-w-0 items-center gap-1 truncate font-mono text-[10px] leading-none text-white/40 sm:inline-flex">
            <span>glob:{glob}</span>
          </span>
        )}
        {path && path !== "." && (
          <span className="hidden min-w-0 items-center gap-0.5 truncate font-mono text-[10px] leading-none text-white/35 md:inline-flex">
            <span>in {path}</span>
          </span>
        )}
      </div>
    )
  }

  if (toolName === "ls") {
    const path = typeof toolContent.args?.path === "string" ? toolContent.args.path.trim() : "."
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-sky-300">
          ls
        </span>
        <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] leading-none text-white/60">
          <Folder className="h-3 w-3 shrink-0 text-white/30" />
          <span className="truncate">{path}</span>
        </span>
      </div>
    )
  }

  if (toolName === "lsp") {
    const operation =
      typeof toolContent.args?.operation === "string" ? toolContent.args.operation : ""
    const filePath = typeof toolContent.args?.filePath === "string" ? toolContent.args.filePath : ""
    const fileName = filePath ? filePath.split("/").pop() || filePath : ""
    const line = typeof toolContent.args?.line === "number" ? `:${toolContent.args.line}` : ""
    const query = typeof toolContent.args?.query === "string" ? ` "${toolContent.args.query}"` : ""
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-teal-300">
          lsp
        </span>
        {operation && (
          <span className="shrink-0 font-mono text-[11px] leading-none text-teal-400/80">
            {operation}
          </span>
        )}
        {fileName && (
          <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] leading-none text-white/60">
            <span className="truncate">
              {fileName}
              {line}
            </span>
          </span>
        )}
        {query && (
          <span className="truncate font-mono text-[11px] leading-none text-white/60">{query}</span>
        )}
      </div>
    )
  }

  if (toolName === "task") {
    const description =
      typeof toolContent.args?.description === "string" ? toolContent.args.description.trim() : ""
    const name = typeof toolContent.args?.name === "string" ? toolContent.args.name.trim() : ""
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-blue-300">
          task
        </span>
        {name && (
          <span className="shrink-0 rounded bg-blue-500/10 px-1 py-0.5 font-mono text-[10px] leading-none text-blue-300">
            {name}
          </span>
        )}
        {description && (
          <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] leading-none text-white/60">
            <Bot className="h-3 w-3 shrink-0 text-white/30" />
            <span className="truncate">{description}</span>
          </span>
        )}
      </div>
    )
  }

  if (toolName === "read_skill") {
    const skillName =
      typeof toolContent.args?.name === "string" && toolContent.args.name.trim()
        ? toolContent.args.name.trim()
        : ""
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-violet-300">
          read_skill
        </span>
        {skillName && (
          <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] leading-none text-white/60">
            <Sparkles className="h-3 w-3 shrink-0 text-violet-300/70" />
            <span className="truncate">{skillName}</span>
          </span>
        )}
      </div>
    )
  }

  if (toolName === "web_search") {
    const query = typeof toolContent.args?.query === "string" ? toolContent.args.query.trim() : ""
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-emerald-300">
          web_search
        </span>
        {query && (
          <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] leading-none text-white/60">
            <Globe className="h-3 w-3 shrink-0 text-white/30" />
            <span className="truncate">"{query}"</span>
          </span>
        )}
      </div>
    )
  }

  if (toolName === "webfetch") {
    const url = typeof toolContent.args?.url === "string" ? toolContent.args.url.trim() : ""
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-emerald-300">
          webfetch
        </span>
        {url && (
          <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] leading-none text-white/60">
            <Globe className="h-3 w-3 shrink-0 text-white/30" />
            <span className="truncate">{url}</span>
          </span>
        )}
      </div>
    )
  }

  if (toolName === "todowrite") {
    let inProgressTask = ""
    const rawTodos = toolContent.args?.todos
    if (Array.isArray(rawTodos)) {
      const active = rawTodos.find(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          (item as { status?: unknown }).status === "in_progress",
      ) as { content?: unknown } | undefined
      if (typeof active?.content === "string" && active.content.trim()) {
        inProgressTask = active.content.trim()
      } else {
        const first = rawTodos.find(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as { content?: unknown }).content === "string",
        ) as { content?: unknown } | undefined
        if (typeof first?.content === "string" && first.content.trim()) {
          inProgressTask = first.content.trim()
        }
      }
    }

    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-orange-300">
          {toolName}
        </span>
        {inProgressTask && (
          <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] leading-none text-white/60">
            <ListTodo className="h-3 w-3 shrink-0 text-orange-300/70" />
            <span className="truncate">{inProgressTask}</span>
          </span>
        )}
      </div>
    )
  }

  if (toolName === "render_svg") {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <Palette className="h-3.5 w-3.5 shrink-0 text-sky-400" />
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-sky-300">
          render_svg
        </span>
      </div>
    )
  }

  if (toolName === "render_ascii") {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <Terminal className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-emerald-300">
          render_ascii
        </span>
      </div>
    )
  }

  if (toolName === "render_html") {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
        <Code2 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-amber-300">
          render_html
        </span>
      </div>
    )
  }

  if (
    ![
      "web_search",
      "apply_patch",
      "read_skill",
      "job_output",
      "job_list",
      "job_kill",
      "render_svg",
      "render_ascii",
      "render_html",
      "switch_mode",
    ].includes(toolName) &&
    toolName.includes("_")
  ) {
    const sepIdx = toolName.indexOf("_")
    const serverName = toolName.slice(0, sepIdx)
    const method = toolName.slice(sepIdx + 1)
    return (
      <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-cyan-300">
        MCP · {serverName} · {method}
      </span>
    )
  }

  return (
    <span className="shrink-0 font-mono text-[12px] font-medium leading-none text-amber-300">
      {toolName}
    </span>
  )
}
