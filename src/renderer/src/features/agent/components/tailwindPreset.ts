/**
 * 内置完整自包含 Tailwind CSS 原型样式预设：
 * 摆脱外部 CDN 依赖与 Electron CSP 网络拦截，0ms 即时加载，提供完整现代化 UI 原型支持。
 */
export const TAILWIND_PROTOTYPE_CSS = `
/* CSS Reset & Box Sizing */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
:root {
  color-scheme: dark;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
html, body {
  font-family: var(--font-sans);
  background-color: #09090b;
  color: #f4f4f5;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden !important;
  overflow-y: hidden !important;
}

/* Display & Layout */
.block { display: block; }
.inline-block { display: inline-block; }
.inline { display: inline; }
.flex { display: flex; }
.inline-flex { display: inline-flex; }
.grid { display: grid; }
.hidden { display: none; }

/* Flexbox */
.flex-row { flex-direction: row; }
.flex-row-reverse { flex-direction: row-reverse; }
.flex-col { flex-direction: column; }
.flex-col-reverse { flex-direction: column-reverse; }
.flex-wrap { flex-wrap: wrap; }
.flex-nowrap { flex-wrap: nowrap; }
.items-start { align-items: flex-start; }
.items-end { align-items: flex-end; }
.items-center { align-items: center; }
.items-baseline { align-items: baseline; }
.items-stretch { align-items: stretch; }
.justify-start { justify-content: flex-start; }
.justify-end { justify-content: flex-end; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.justify-around { justify-content: space-around; }
.justify-evenly { justify-content: space-evenly; }
.flex-1 { flex: 1 1 0%; }
.flex-auto { flex: 1 1 auto; }
.flex-initial { flex: 0 1 auto; }
.flex-none { flex: none; }
.grow { flex-grow: 1; }
.grow-0 { flex-grow: 0; }
.shrink { flex-shrink: 1; }
.shrink-0 { flex-shrink: 0; }

/* Grid */
.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.grid-cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.grid-cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.grid-cols-12 { grid-template-columns: repeat(12, minmax(0, 1fr)); }
.col-span-1 { grid-column: span 1 / span 1; }
.col-span-2 { grid-column: span 2 / span 2; }
.col-span-3 { grid-column: span 3 / span 3; }
.col-span-4 { grid-column: span 4 / span 4; }
.col-span-6 { grid-column: span 6 / span 6; }
.col-span-12 { grid-column: span 12 / span 12; }

/* Spacing - Gap */
.gap-0 { gap: 0px; }
.gap-0.5 { gap: 2px; }
.gap-1 { gap: 4px; }
.gap-1.5 { gap: 6px; }
.gap-2 { gap: 8px; }
.gap-2.5 { gap: 10px; }
.gap-3 { gap: 12px; }
.gap-3.5 { gap: 14px; }
.gap-4 { gap: 16px; }
.gap-5 { gap: 20px; }
.gap-6 { gap: 24px; }
.gap-8 { gap: 32px; }
.gap-10 { gap: 40px; }

/* Spacing - Padding */
.p-0 { padding: 0px; }
.p-1 { padding: 4px; }
.p-1.5 { padding: 6px; }
.p-2 { padding: 8px; }
.p-2.5 { padding: 10px; }
.p-3 { padding: 12px; }
.p-3.5 { padding: 14px; }
.p-4 { padding: 16px; }
.p-5 { padding: 20px; }
.p-6 { padding: 24px; }
.p-8 { padding: 32px; }
.px-0 { padding-left: 0px; padding-right: 0px; }
.px-1 { padding-left: 4px; padding-right: 4px; }
.px-2 { padding-left: 8px; padding-right: 8px; }
.px-2.5 { padding-left: 10px; padding-right: 10px; }
.px-3 { padding-left: 12px; padding-right: 12px; }
.px-4 { padding-left: 16px; padding-right: 16px; }
.px-5 { padding-left: 20px; padding-right: 20px; }
.px-6 { padding-left: 24px; padding-right: 24px; }
.px-8 { padding-left: 32px; padding-right: 32px; }
.py-0 { padding-top: 0px; padding-bottom: 0px; }
.py-0.5 { padding-top: 2px; padding-bottom: 2px; }
.py-1 { padding-top: 4px; padding-bottom: 4px; }
.py-1.5 { padding-top: 6px; padding-bottom: 6px; }
.py-2 { padding-top: 8px; padding-bottom: 8px; }
.py-2.5 { padding-top: 10px; padding-bottom: 10px; }
.py-3 { padding-top: 12px; padding-bottom: 12px; }
.py-4 { padding-top: 16px; padding-bottom: 16px; }
.py-5 { padding-top: 20px; padding-bottom: 20px; }
.py-6 { padding-top: 24px; padding-bottom: 24px; }
.pt-1 { padding-top: 4px; }
.pt-2 { padding-top: 8px; }
.pt-3 { padding-top: 12px; }
.pt-4 { padding-top: 16px; }
.pb-1 { padding-bottom: 4px; }
.pb-2 { padding-bottom: 8px; }
.pb-3 { padding-bottom: 12px; }
.pb-4 { padding-bottom: 16px; }
.pl-1 { padding-left: 4px; }
.pl-2 { padding-left: 8px; }
.pl-3 { padding-left: 12px; }
.pl-4 { padding-left: 16px; }
.pr-1 { padding-right: 4px; }
.pr-2 { padding-right: 8px; }
.pr-3 { padding-right: 12px; }
.pr-4 { padding-right: 16px; }

/* Spacing - Margin */
.m-0 { margin: 0px; }
.m-auto { margin: auto; }
.mx-auto { margin-left: auto; margin-right: auto; }
.my-auto { margin-top: auto; margin-bottom: auto; }
.m-1 { margin: 4px; }
.m-2 { margin: 8px; }
.m-3 { margin: 12px; }
.m-4 { margin: 16px; }
.mx-1 { margin-left: 4px; margin-right: 4px; }
.mx-2 { margin-left: 8px; margin-right: 8px; }
.mx-3 { margin-left: 12px; margin-right: 12px; }
.mx-4 { margin-left: 16px; margin-right: 16px; }
.my-1 { margin-top: 4px; margin-bottom: 4px; }
.my-2 { margin-top: 8px; margin-bottom: 8px; }
.my-3 { margin-top: 12px; margin-bottom: 12px; }
.my-4 { margin-top: 16px; margin-bottom: 16px; }
.mt-1 { margin-top: 4px; }
.mt-2 { margin-top: 8px; }
.mt-3 { margin-top: 12px; }
.mt-4 { margin-top: 16px; }
.mt-6 { margin-top: 24px; }
.mt-8 { margin-top: 32px; }
.mb-1 { margin-bottom: 4px; }
.mb-2 { margin-bottom: 8px; }
.mb-3 { margin-bottom: 12px; }
.mb-4 { margin-bottom: 16px; }
.mb-6 { margin-bottom: 24px; }
.mb-8 { margin-bottom: 32px; }

/* Sizing - Width & Height */
.w-full { width: 100%; }
.w-auto { width: auto; }
.w-fit { width: fit-content; }
.w-screen { width: 100vw; }
.w-1 { width: 4px; }
.w-2 { width: 8px; }
.w-3 { width: 12px; }
.w-3.5 { width: 14px; }
.w-4 { width: 16px; }
.w-5 { width: 20px; }
.w-6 { width: 24px; }
.w-7 { width: 28px; }
.w-8 { width: 32px; }
.w-10 { width: 40px; }
.w-12 { width: 48px; }
.w-16 { width: 64px; }
.w-20 { width: 80px; }
.w-24 { width: 96px; }
.w-32 { width: 128px; }
.w-40 { width: 160px; }
.w-48 { width: 192px; }
.w-56 { width: 224px; }
.w-64 { width: 256px; }
.w-72 { width: 288px; }
.w-80 { width: 320px; }
.w-96 { width: 384px; }

.h-full { height: 100%; }
.h-auto { height: auto; }
.h-fit { height: fit-content; }
.h-screen { height: 100vh; }
.h-1 { height: 4px; }
.h-2 { height: 8px; }
.h-3 { height: 12px; }
.h-3.5 { height: 14px; }
.h-4 { height: 16px; }
.h-5 { height: 20px; }
.h-6 { height: 24px; }
.h-7 { height: 28px; }
.h-8 { height: 32px; }
.h-10 { height: 40px; }
.h-12 { height: 48px; }
.h-16 { height: 64px; }
.h-20 { height: 80px; }
.h-24 { height: 96px; }
.h-32 { height: 128px; }
.h-40 { height: 160px; }
.h-48 { height: 192px; }
.h-64 { height: 256px; }

.max-w-xs { max-width: 320px; }
.max-w-sm { max-width: 384px; }
.max-w-md { max-width: 448px; }
.max-w-lg { max-width: 512px; }
.max-w-xl { max-width: 576px; }
.max-w-2xl { max-width: 672px; }
.max-w-full { max-width: 100%; }
.min-h-screen { min-height: 100vh; }
.min-h-full { min-height: 100%; }

/* Positioning */
.relative { position: relative; }
.absolute { position: absolute; }
.fixed { position: fixed; }
.sticky { position: sticky; }
.top-0 { top: 0px; }
.right-0 { right: 0px; }
.bottom-0 { bottom: 0px; }
.left-0 { left: 0px; }
.z-10 { z-index: 10; }
.z-20 { z-index: 20; }
.z-50 { z-index: 50; }

/* Typography */
.font-sans { font-family: var(--font-sans); }
.font-mono { font-family: var(--font-mono); }
.text-xs { font-size: 11px; line-height: 16px; }
.text-sm { font-size: 13px; line-height: 20px; }
.text-base { font-size: 15px; line-height: 24px; }
.text-lg { font-size: 17px; line-height: 26px; }
.text-xl { font-size: 20px; line-height: 28px; }
.text-2xl { font-size: 24px; line-height: 32px; }
.text-3xl { font-size: 30px; line-height: 36px; }
.font-normal { font-weight: 400; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.whitespace-nowrap { white-space: nowrap; }
.whitespace-pre-wrap { white-space: pre-wrap; }

/* Colors - Backgrounds */
.bg-transparent { background-color: transparent; }
.bg-black { background-color: #000000; }
.bg-white { background-color: #ffffff; }
.bg-zinc-950 { background-color: #09090b; }
.bg-zinc-900 { background-color: #18181b; }
.bg-zinc-850 { background-color: #202023; }
.bg-zinc-800 { background-color: #27272a; }
.bg-zinc-750 { background-color: #323236; }
.bg-zinc-700 { background-color: #3f3f46; }
.bg-zinc-600 { background-color: #52525b; }
.bg-zinc-500 { background-color: #71717a; }
.bg-slate-900 { background-color: #0f172a; }
.bg-slate-800 { background-color: #1e293b; }
.bg-slate-700 { background-color: #334155; }
.bg-neutral-900 { background-color: #171717; }
.bg-neutral-800 { background-color: #262626; }
.bg-sky-500 { background-color: #0ea5e9; }
.bg-sky-600 { background-color: #0284c7; }
.bg-sky-950 { background-color: #082f49; }
.bg-blue-500 { background-color: #3b82f6; }
.bg-blue-600 { background-color: #2563eb; }
.bg-indigo-500 { background-color: #6366f1; }
.bg-purple-500 { background-color: #a855f7; }
.bg-emerald-500 { background-color: #10b981; }
.bg-emerald-600 { background-color: #059669; }
.bg-rose-500 { background-color: #f43f5e; }
.bg-rose-600 { background-color: #e11d48; }
.bg-amber-500 { background-color: #f59e0b; }
.bg-red-500 { background-color: #ef4444; }

/* Colors - Text */
.text-white { color: #ffffff; }
.text-black { color: #000000; }
.text-zinc-100 { color: #f4f4f5; }
.text-zinc-200 { color: #e4e4e7; }
.text-zinc-300 { color: #d4d4d8; }
.text-zinc-400 { color: #a1a1aa; }
.text-zinc-500 { color: #71717a; }
.text-slate-200 { color: #e2e8f0; }
.text-slate-300 { color: #cbd5e1; }
.text-slate-400 { color: #94a3b8; }
.text-sky-300 { color: #7dd3fc; }
.text-sky-400 { color: #38bdf8; }
.text-blue-400 { color: #60a5fa; }
.text-emerald-400 { color: #34d399; }
.text-rose-400 { color: #fb7185; }
.text-amber-400 { color: #fbbf24; }
.text-red-400 { color: #f87171; }

/* Borders & Radius */
.border { border-width: 1px; border-style: solid; border-color: rgba(255, 255, 255, 0.1); }
.border-0 { border-width: 0px; }
.border-2 { border-width: 2px; }
.border-t { border-top-width: 1px; border-top-style: solid; }
.border-r { border-right-width: 1px; border-right-style: solid; }
.border-b { border-bottom-width: 1px; border-bottom-style: solid; }
.border-l { border-left-width: 1px; border-left-style: solid; }
.border-white\\/5 { border-color: rgba(255, 255, 255, 0.05); }
.border-white\\/10 { border-color: rgba(255, 255, 255, 0.1); }
.border-white\\/15 { border-color: rgba(255, 255, 255, 0.15); }
.border-white\\/20 { border-color: rgba(255, 255, 255, 0.2); }
.border-zinc-800 { border-color: #27272a; }
.border-zinc-700 { border-color: #3f3f46; }
.border-zinc-600 { border-color: #52525b; }
.border-slate-800 { border-color: #1e293b; }
.border-slate-700 { border-color: #334155; }
.border-sky-500 { border-color: #0ea5e9; }
.border-emerald-500 { border-color: #10b981; }
.border-rose-500 { border-color: #f43f5e; }

.rounded-none { border-radius: 0px; }
.rounded-sm { border-radius: 2px; }
.rounded { border-radius: 4px; }
.rounded-md { border-radius: 6px; }
.rounded-lg { border-radius: 8px; }
.rounded-xl { border-radius: 12px; }
.rounded-2xl { border-radius: 16px; }
.rounded-3xl { border-radius: 24px; }
.rounded-full { border-radius: 9999px; }

/* Shadows & Opacity */
.shadow-sm { box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.5); }
.shadow { box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.5), 0 1px 2px -1px rgba(0, 0, 0, 0.5); }
.shadow-md { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.5); }
.shadow-lg { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5); }
.shadow-xl { box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5); }
.shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); }
.opacity-50 { opacity: 0.5; }
.opacity-70 { opacity: 0.7; }
.opacity-80 { opacity: 0.8; }
.opacity-90 { opacity: 0.9; }

/* Transitions & Interactivity */
.cursor-pointer { cursor: pointer; }
.cursor-not-allowed { cursor: not-allowed; }
.select-none { user-select: none; }
.transition { transition-property: all; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
.transition-colors { transition-property: color, background-color, border-color; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
.hover\\:bg-white\\/5:hover { background-color: rgba(255, 255, 255, 0.05); }
.hover\\:bg-white\\/10:hover { background-color: rgba(255, 255, 255, 0.1); }
.hover\\:bg-zinc-700:hover { background-color: #3f3f46; }
.hover\\:bg-zinc-600:hover { background-color: #52525b; }
.hover\\:bg-sky-600:hover { background-color: #0284c7; }
.hover\\:text-white:hover { color: #ffffff; }
.hover\\:border-white\\/30:hover { border-color: rgba(255, 255, 255, 0.3); }

/* Form Controls & Prototype Resets */
button {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  border: none;
  background: transparent;
}
input, textarea, select {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  outline: none;
}

/* SVG Explicit Sizing Rules */
svg {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
svg.w-3 { width: 12px !important; height: 12px !important; }
svg.w-3.5 { width: 14px !important; height: 14px !important; }
svg.w-4 { width: 16px !important; height: 16px !important; }
svg.w-5 { width: 20px !important; height: 20px !important; }
svg.w-6 { width: 24px !important; height: 24px !important; }
svg.w-7 { width: 28px !important; height: 28px !important; }
svg.w-8 { width: 32px !important; height: 32px !important; }
svg.w-10 { width: 40px !important; height: 40px !important; }
svg.w-12 { width: 48px !important; height: 48px !important; }
`
