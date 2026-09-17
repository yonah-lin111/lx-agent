<div align="center">

# LX Agent

**A local-first desktop workspace for producing prompts, projects and agent teams — no backend, no account, your data never leaves the machine.**

**Languages:** **English** | [简体中文](./README.zh-CN.md)

[![Release](https://img.shields.io/github/v/release/yonah-lin111/lx-agent?sort=semver&label=release)](https://github.com/yonah-lin111/lx-agent/releases/latest)
[![Release workflow](https://github.com/yonah-lin111/lx-agent/actions/workflows/release.yml/badge.svg)](https://github.com/yonah-lin111/lx-agent/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)](#)

![LX Agent home dashboard on the pixel theme](./docs/assets/home-dashboard.png)

</div>

## What it is

LX Agent is an Electron desktop application that pairs you with a coding-capable agent while you
build prompt-driven projects. The agent loop — LLM calls, tool execution, process management,
permissions and session state — runs entirely in the main process against a local SQLite database;
the window is pure UI. You point it at your own API keys, so there is nothing to deploy and no
service to trust.

It is built for people who treat prompts as source code: drafts get planned, reviewed, executed and
versioned in the same workspace, with an agent that can read and patch real files.

## Features

| Area | What it does |
| :--- | :--- |
| **Agent runtime** | Streaming multi-turn chat on Anthropic, OpenAI, Google or any OpenAI-compatible endpoint, with per-task model selection, an idle watchdog and abort/resume control. |
| **Collaboration modes** | `Shift + Tab` cycles `build → plan → review → design`. Plan, review and design answers are parsed out of the stream into interactive cards — implementation plan, review findings, front-design canvas — with one-click promotion back to build. |
| **Tooling** | File `read` / `write` / `edit` plus atomic multi-file patches, `glob` / `grep` / `find` search, PTY-backed unified exec with background jobs, web fetch and web search, image viewing, to-do lists and post-write LSP diagnostics. |
| **Safety gates** | Four-mode permission gate, three-tier sandbox, Guardian risk evaluator, repeat-tool guard and multi-level approval prompts before anything touches your disk. |
| **Context governance** | Automatic compaction and pruning plus Token Saver — deterministic tool-output compression with optional style injection — to keep long sessions affordable. |
| **Subagents & memory** | A role-governed subagent pool for parallel work, and a persistent memory manager (`MEMORY.md` plus topic notes) that survives across sessions. |
| **MCP, Skills & Hooks** | Plug in stdio MCP servers, reusable `SKILL.md` skills and lifecycle hooks; curated presets install with one click. |
| **Sessions** | Up to 8 parallel agent tabs, steer and follow-up queues, SQLite-persisted history, session forking from any user turn and standalone HTML export. |
| **Projects** | Group prompts, assets and files into projects and folders, with fast file search across referenced paths. |
| **Markdown studio** | CodeMirror-based editor with variable commands, template presets and a rendered preview side by side. |
| **Front Design** | Agents emit design specs that render live inside an isolated preview protocol, so iterations happen in place instead of in screenshots. |
| **OpenClaw** | WebSocket access to one or many gateways: fan a single message out to several agents, watch the merged timeline, and delegate tasks across pages with `@claw:<instance>/<agent>`. |
| **Terminal & Git** | Integrated xterm terminal on a real PTY, plus repository status and snapshots inside the workspace. |
| **Usage & schedule** | Token, cost and request dashboards per model, provider and session; daily task planning and a year-long session activity heatmap. |
| **Themes & i18n** | Switchable **default** and **pixel** themes and a fully localized English / Simplified Chinese interface. |
| **Desktop extras** | Voice input through Groq Whisper, native notifications when an agent finishes, built-in pixel games plus local GBA ROMs, a CLI manager for Claude Code / Codex / Gemini CLI / OpenCode, and an in-app update check against GitHub Releases. |

## Screenshots

### Agent sessions and execution flow

| Execution flow (per-turn tokens and tool timings) | Integrated terminal (OpenCode / Claude Code) |
| :---: | :---: |
| ![Agent execution flow view with system prompt, initial model and grouped tool calls](./docs/assets/agent-execution-flow.png) | ![Integrated terminal running OpenCode and Claude Code](./docs/assets/terminal-cli.png) |

### Design and collaboration

| Front Design canvas | OpenClaw multi-instance workspace |
| :---: | :---: |
| ![Front Design canvas rendering an agent-generated design live](./docs/assets/front-design-canvas.png) | ![OpenClaw workspace with offices, team members and a merged conversation](./docs/assets/openclaw-workspace.png) |

### Pixel theme

![Settings on the pixel theme](./docs/assets/settings-pixel-theme.png)

## Tech stack

| Layer | Choices |
| :--- | :--- |
| Shell | Electron 39, electron-vite, electron-builder |
| UI | React 19, TypeScript, Tailwind CSS 4, lucide-react, Recharts |
| Editor & terminal | CodeMirror 6, xterm.js, Mermaid, highlight.js |
| Agent core | Vercel AI SDK 6, Zod schemas, custom turn state machine |
| Storage | SQLite (better-sqlite3) with forward-only migrations |
| Integrations | Model Context Protocol SDK, OpenClaw gateway client, LSP JSON-RPC |

## Documentation

Architecture and runtime design notes live in [`docs/`](./docs) (written in Chinese):

- [`docs/agent/architecture.md`](./docs/agent/architecture.md) — process model, turn state machine, message flow and storage
- [`docs/agent/runtime.md`](./docs/agent/runtime.md) — execution engine, context governance, subagents and memory
- [`docs/agent/tools.md`](./docs/agent/tools.md) — built-in tools and prompt assembly
- [`docs/agent/permissions.md`](./docs/agent/permissions.md) — permission modes, sandbox tiers and approvals
- [`docs/agent/modes.md`](./docs/agent/modes.md) — Plan / Review / Design protocols and cards
- [`docs/agent/openclaw.md`](./docs/agent/openclaw.md) — gateway integration and task delegation
- [`docs/standards/`](./docs/standards) — engineering and UI standards used by this repository

## License

Released under the [MIT License](./LICENSE). © 2026 yonah-lin111.
