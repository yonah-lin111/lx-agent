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
    tetris: {
      name: "Tetris",
      description: "Stack falling blocks, clear lines, survive the speed-up.",
      controls: "← → move · ↑ / X rotate · ↓ soft drop · Space hard drop",
      info: `### Tetris

Fill rows with falling blocks to clear them. Gravity speeds up every 10 lines.

- **← / →** move, **↓** soft drop
- **↑** or **X** rotate (simple wall kicks)
- **Space** hard drop — instant lock for extra points
- A ghost outline shows where the piece will land

**Scoring:** 1/2/3/4 lines = 40/100/300/1200 × level, plus 1 per soft-dropped cell and 2 per hard-dropped cell. The run ends when a new piece cannot spawn.`,
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
    hop: {
      name: "Hop",
      description: "Charge, jump, land on the next platform — hit the center for bonus.",
      controls: "Hold Space / press and hold to charge · release to jump",
      info: `### Hop

Hold to charge, release to jump. Land on the next platform or the run ends.

- **Hold Space / press and hold** to build power, release to jump
- Landing anywhere on the platform scores 1 point
- Landing within 10px of its center scores 2 points
- Platforms always spawn within reach of a full charge

**Scoring:** 1 point per platform, 2 for a perfect landing.`,
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
