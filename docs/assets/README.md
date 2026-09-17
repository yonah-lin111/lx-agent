# Asset Placeholders

The three images referenced by `README.md` / `README.zh-CN.md` are **pixel-theme placeholders**.
Replace each file with a real screenshot (PNG is recommended — keep the same base name and update the
link extension in both README files, or export directly to `.svg` if you prefer).

| File | Size | What to capture |
| :--- | :--- | :--- |
| `hero.svg` | 1280 x 640 | Full main window on the **pixel theme**: home dashboard (hero + quick entries + activity heatmap). This is the first thing visitors see — make the pixel-art styling obvious. |
| `screenshot-agent.svg` | 1440 x 900 | A running agent conversation: streaming answer, tool execution groups, and one of the structured cards (proposed plan / review findings / front design). |
| `screenshot-theme-pixel.svg` | 1440 x 900 | Pixel theme in a second surface — settings page, Front Design canvas, or the built-in pixel games — to show the theme is global, not cosmetic. |

Requirements for all three:

- **Pixel theme enabled** (`data-theme="pixel"`), dark background, consistent window size while shooting.
- No real API keys, tokens, private file paths, session titles, or personal data visible.
- Prefer PNG (lossless UI edges) and keep files reasonably small (a few hundred KB each).
