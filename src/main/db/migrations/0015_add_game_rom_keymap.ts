import type { Migration } from "./types"

/**
 * 为 game_rom_entry 表增加 keymap 字段：每游戏按键覆盖的 JSON，NULL 表示全部使用默认键位。
 */
export const migration: Migration = {
  version: 15,
  name: "add_game_rom_keymap",
  up: (database) => {
    database.exec(`
      ALTER TABLE game_rom_entry ADD COLUMN keymap TEXT;
    `)
  },
}
