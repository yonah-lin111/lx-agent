export const arcade = {
  title: "Arcade",
  logoHint: "Feeling lucky?",
  backToList: "Back to games",
  backToIndex: "Back to index",
  pause: "Pause",
  resume: "Resume",
  restart: "Restart",
  picker: {
    subtitle: "Three tiny games drawn purely with code. Best scores are kept on this device.",
    best: "Best",
    play: "Play",
  },
  games: {
    oneStroke: {
      name: "One Stroke",
      description: "Trace one line through every tile without lifting or crossing.",
      controls: "Drag or click adjacent tiles · trace back to undo",
      info: `### One Stroke

Clear **8 grids** with one unbroken line each — 3×3 growing to 7×7.

- **Drag or click** an adjacent tile to extend the line
- Trace back onto the previous tile to undo
- Press \`R\` to clear the current grid
- A 3-2-1 countdown starts every next grid

**Scoring:** tiles on the grid × 10 per cleared grid.`,
    },
    dodge: {
      name: "Stardust Dodge",
      description: "Survive 60 seconds of bullet storms and grab starlight.",
      controls: "WASD / Arrows to move · Space to dash",
      info: `### Stardust Dodge

Survive **60 seconds** of bullet storms with 3 hit points.

- **WASD / Arrows** to move
- **Space** to dash (about 0.2s burst, ~1s cooldown)
- Hits cost 1 HP and grant a brief invincibility window
- Starlight spawns every few seconds and expires if ignored

**Scoring:** 10 per survived second + 25 per starlight collected.`,
    },
    runner: {
      name: "Silhouette Run",
      description: "One-button endless run: jump, collect light, chase distance.",
      controls: "Space / Click to jump · hold for a higher jump",
      info: `### Silhouette Run

One-button endless run — the first hit ends the run.

- **Space / Click** to jump, hold for a higher jump
- Ground blocks must be jumped over; floating blocks must be run under
- Collect starlight to raise the multiplier by +0.1 (up to ×3)

**Scoring:** distance in meters × multiplier.`,
    },
  },
  paused: "Paused",
  result: {
    title: "Run finished",
    score: "Score",
    newBest: "New best!",
    best: "Best",
    playAgain: "Play again",
    pickAnother: "Pick another game",
  },
}
