export const game = {
  title: "Games",
  subtitle:
    "Import local GBA ROMs. The emulator runs offline and save data stays in the local app data directory.",
  import: "Import Game",
  importing: "Importing…",
  loading: "Loading games…",
  empty: "No games yet",
  emptyHint:
    'Click "Import Game" to pick .gba files (64MB max each). Importing the same game again will not create a duplicate card.',
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
