export const BASE_STYLES = `    :root {
      --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
      --ease-spring: cubic-bezier(0.32, 0.72, 0, 1);
      --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: "SF Mono", "Fira Code", Menlo, Monaco, Consolas, monospace;
      
      --bg-base: #09090b;
      --bg-surface: #121215;
      --bg-surface-raised: #18181b;
      --bg-surface-elevated: #202024;
      --bg-hover: rgba(255, 255, 255, 0.06);
      --bg-active: rgba(255, 255, 255, 0.1);
      
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-medium: rgba(255, 255, 255, 0.14);
      --border-focus: rgba(56, 189, 248, 0.5);
      
      --text-primary: #f4f4f5;
      --text-secondary: #a1a1aa;
      --text-tertiary: #71717a;
      
      --accent-blue: #38bdf8;
      --accent-blue-subtle: rgba(56, 189, 248, 0.12);
      --accent-emerald: #34d399;
      --accent-emerald-subtle: rgba(52, 211, 153, 0.12);
      --accent-amber: #fbbf24;
      --accent-amber-subtle: rgba(251, 191, 36, 0.12);
      --accent-rose: #fb7185;
      --accent-rose-subtle: rgba(251, 113, 133, 0.12);
      --accent-purple: #c084fc;
      --accent-purple-subtle: rgba(192, 132, 252, 0.12);
      
      --code-bg: #0d0d10;
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
      --shadow-md: 0 4px 12px 0 rgba(0, 0, 0, 0.4);
      --glass-bg: rgba(18, 18, 21, 0.75);
      --glass-border: rgba(255, 255, 255, 0.1);
    }

    :root[data-theme="light"] {
      --bg-base: #f8f9fa;
      --bg-surface: #ffffff;
      --bg-surface-raised: #f4f4f6;
      --bg-surface-elevated: #eaeaed;
      --bg-hover: rgba(0, 0, 0, 0.04);
      --bg-active: rgba(0, 0, 0, 0.08);
      
      --border-subtle: rgba(0, 0, 0, 0.07);
      --border-medium: rgba(0, 0, 0, 0.12);
      --border-focus: rgba(2, 132, 199, 0.5);
      
      --text-primary: #18181b;
      --text-secondary: #52525b;
      --text-tertiary: #a1a1aa;
      
      --accent-blue: #0284c7;
      --accent-blue-subtle: rgba(2, 132, 199, 0.08);
      --accent-emerald: #059669;
      --accent-emerald-subtle: rgba(5, 150, 105, 0.08);
      --accent-amber: #d97706;
      --accent-amber-subtle: rgba(217, 119, 6, 0.08);
      --accent-rose: #e11d48;
      --accent-rose-subtle: rgba(225, 29, 72, 0.08);
      --accent-purple: #7c3aed;
      --accent-purple-subtle: rgba(124, 58, 237, 0.08);
      
      --code-bg: #f4f4f6;
      --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 16px 0 rgba(0, 0, 0, 0.06);
      --glass-bg: rgba(255, 255, 255, 0.82);
      --glass-border: rgba(0, 0, 0, 0.08);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: var(--font-sans);
      background-color: var(--bg-base);
      color: var(--text-primary);
      line-height: 1.6;
      font-size: 14px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      padding-bottom: 64px;
    }

    /* 顶部毛玻璃导航条 */
    .sticky-header {
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      background: var(--glass-bg);
      border-bottom: 1px solid var(--glass-border);
      transition: background 200ms var(--ease-out);
    }
    .header-inner {
      max-width: 920px;
      margin: 0 auto;
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .header-branding {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 7px;
      background: linear-gradient(135deg, #0284c7, #7c3aed);
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      box-shadow: var(--shadow-sm);
      flex-shrink: 0;
    }
    .header-titles {
      min-width: 0;
    }
    .header-titles h1 {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.015em;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    /* 按钮规范与微动效 */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: var(--shadow-sm);
      transition: transform 160ms var(--ease-out), background 160ms var(--ease-out), border-color 160ms var(--ease-out);
      user-select: none;
    }
    @media (hover: hover) and (pointer: fine) {
      .btn:hover {
        background: var(--bg-hover);
        border-color: var(--border-medium);
      }
    }
    .btn:active {
      transform: scale(0.97);
    }

    .main-container {
      max-width: 920px;
      margin: 28px auto 0;
      padding: 0 20px;
    }

    /* 会话详情概览卡片 */
    .session-hero-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: 20px 24px;
      margin-bottom: 24px;
      box-shadow: var(--shadow-sm);
    }
    .hero-meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--border-subtle);
      font-size: 12px;
      color: var(--text-secondary);
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .meta-item .meta-label {
      color: var(--text-tertiary);
    }
    .meta-item code {
      font-family: var(--font-mono);
      font-size: 11px;
      background: var(--bg-surface-raised);
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid var(--border-subtle);
    }

`
