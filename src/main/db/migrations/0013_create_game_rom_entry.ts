import type { Migration } from "./types"

/**
 * 新增 game_rom_entry：用户导入的本地 GBA ROM 条目。
 * rom_hash（内容 sha256）唯一，作为重复导入去重键；rom_path 指向应用数据目录内的副本。
 */
export const migration: Migration = {
  version: 13,
  name: "create_game_rom_entry",
  up: (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS game_rom_entry (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        rom_path TEXT NOT NULL,
        rom_hash TEXT NOT NULL UNIQUE,
        rom_size INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        last_played_at TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_game_rom_entry_last_played ON game_rom_entry(last_played_at);
    `)
  },
}
