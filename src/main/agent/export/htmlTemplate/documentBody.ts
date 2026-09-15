import { escapeHtml, formatTimestamp } from "./htmlUtils"

export const buildStickyHeader = (title: string): string => `  <header class="sticky-header">
    <div class="header-inner">
      <div class="header-branding">
        <div class="logo-badge">LX</div>
        <div class="header-titles">
          <h1>${escapeHtml(title)}</h1>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn" onclick="toggleAllTools()" title="展开/收起全部工具调用与思考">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg>
          <span>折叠切换</span>
        </button>
        <button class="btn" onclick="toggleTheme()" title="切换明亮/暗黑主题">
          <svg class="theme-icon" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          <span id="theme-btn-text">主题</span>
        </button>
      </div>
    </div>
  </header>`

export const buildSessionHero = (
  title: string,
  sessionId: string,
  createdAt: string,
  cwd: string,
): string => `    <section class="session-hero-card">
      <h2>${escapeHtml(title)}</h2>
      <div class="hero-meta-grid">
        <div class="meta-item">
          <span class="meta-label">会话 ID:</span>
          <code>${escapeHtml(sessionId)}</code>
        </div>
        <div class="meta-item">
          <span class="meta-label">创建时间:</span>
          <span>${formatTimestamp(createdAt)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">工作目录:</span>
          <code>${escapeHtml(cwd)}</code>
        </div>
      </div>
    </section>`

export const buildStatsGrid = (
  userTurnCount: number,
  assistantTurnCount: number,
  totalToolCalls: number,
  totalInputTokens: number,
  totalOutputTokens: number,
): string => `    <section class="stats-grid">
      <div class="stat-pill">
        <div class="stat-label">用户提问</div>
        <div class="stat-value">${userTurnCount}</div>
      </div>
      <div class="stat-pill">
        <div class="stat-label">Agent 回答</div>
        <div class="stat-value">${assistantTurnCount}</div>
      </div>
      <div class="stat-pill">
        <div class="stat-label">工具调用</div>
        <div class="stat-value">${totalToolCalls}</div>
      </div>
      <div class="stat-pill">
        <div class="stat-label">Token 消耗</div>
        <div class="stat-value">${(totalInputTokens + totalOutputTokens).toLocaleString()}</div>
      </div>
    </section>`
