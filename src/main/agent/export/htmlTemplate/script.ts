export const SESSION_SCRIPT = `  <script>
    function copyCode(button) {
      const code = button.closest('.code-block-wrapper').querySelector('code').innerText;
      navigator.clipboard.writeText(code).then(() => {
        const textSpan = button.querySelector('.btn-text');
        const originalText = textSpan.innerText;
        textSpan.innerText = '已复制!';
        button.style.borderColor = 'var(--accent-emerald)';
        button.style.color = 'var(--accent-emerald)';
        setTimeout(() => {
          textSpan.innerText = originalText;
          button.style.borderColor = '';
          button.style.color = '';
        }, 1500);
      });
    }

    function copySnippet(button) {
      const code = button.closest('.tool-section').querySelector('code').innerText;
      navigator.clipboard.writeText(code).then(() => {
        const originalText = button.innerText;
        button.innerText = '已复制!';
        button.style.borderColor = 'var(--accent-emerald)';
        button.style.color = 'var(--accent-emerald)';
        setTimeout(() => {
          button.innerText = originalText;
          button.style.borderColor = '';
          button.style.color = '';
        }, 1500);
      });
    }

    let allExpanded = false;
    function toggleAllTools() {
      allExpanded = !allExpanded;
      document.querySelectorAll('details.tool-call-block, details.thinking-block').forEach(d => {
        d.open = allExpanded;
      });
    }

    function toggleTheme() {
      const root = document.documentElement;
      const current = root.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
    }
  </script>`
