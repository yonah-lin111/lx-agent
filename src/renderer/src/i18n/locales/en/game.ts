export const game = {
  title: "Games",
  subtitle:
    "Import local GBA ROMs. The emulator runs offline and save data stays in the local app data directory.",
  import: "Import GBA Game",
  importing: "Importing…",
  loading: "Loading games…",
  builtin: {
    sectionTitle: "Built-in games",
    tag: "Built-in",
    best: "Best",
    pause: "Pause",
    resume: "Resume",
    restart: "Restart",
    paused: "Paused",
    result: {
      title: "Run finished",
      newBest: "New best!",
      best: "Best",
      playAgain: "Play again",
      pickAnother: "Pick another game",
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
      cake: {
        name: "Cake Stack",
        description: "Stack the layers, slice the overhang, keep the tower alive.",
        controls: "Click / Space to drop · perfect alignment keeps the width",
        info: `### Cake Stack

A cake layer swings above the tower — press **click / Space** to drop it.

- The part hanging over the layer below is **sliced off**, so the tower gets narrower
- Landing within 4px of a perfect match keeps the full width and scores 2
- Missing the layer below ends the run
- Layers swing faster as the tower grows

**Scoring:** 1 point per layer, 2 for a perfect drop.`,
      },
    },
  },
  imported: {
    sectionTitle: "Imported games",
    tag: "Imported",
    empty: "No imported games yet",
    emptyHint:
      'Click "Import Game" to pick .gba files (64MB max each). Importing the same game again will not create a duplicate card.',
  },
  importResult: {
    imported: "Imported {{count}} game(s)",
    duplicated: '"{{title}}" already exists, skipped',
    invalid: 'Failed to import "{{file}}": {{reason}}',
  },
  invalidReason: {
    unsupportedExtension: "only .gba files are supported",
    tooLarge: "file exceeds 64MB",
    unreadable: "file cannot be read",
  },
  card: {
    more: "More actions",
    rename: "Rename",
    remove: "Delete",
    neverPlayed: "Never played",
    lastPlayed: "Last played {{time}}",
  },
  rename: {
    title: "Rename Game",
    placeholder: "Enter card title",
    confirm: "Save",
    cancel: "Cancel",
  },
  remove: {
    title: "Delete Game",
    description: 'This deletes "{{title}}" and its save data. This cannot be undone.',
    success: 'Deleted "{{title}}"',
  },
  stage: {
    loading: "Loading emulator…",
    error: "Failed to load the emulator",
    retry: "Retry",
    back: "Back to games",
    exitHint: "ESC to exit",
  },
  error: {
    listFailed: "Failed to load the game list",
    importFailed: "Import failed",
    renameFailed: "Rename failed",
    removeFailed: "Delete failed",
    saveFailed: "Failed to write save data",
  },
}
