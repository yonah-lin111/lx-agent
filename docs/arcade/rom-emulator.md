# 游戏厅 ROM 模拟器（外部游戏卡片）设计

在 home 索引页的彩蛋游戏厅（`features/arcade`）中，除内建 canvas 游戏外，新增一类可玩 ROM 的卡片：载体为自托管的 EmulatorJS（webview 宿主），ROM 由用户自行提供并导入本地。

**法律边界（不可协商）**：本仓库不内置、不下载、不链接任何 ROM 或 ROM 站点；应用只提供模拟器外壳与本地导入能力，ROM 版权与来源由用户自行负责。仓库内不得出现具体作品名（如"口袋妖怪""星之卡比""究极绿宝石"），卡片名取自用户导入的文件名。

## 1. 已确认决策

| # | 决策 | 结论 |
|---|---|---|
| 1 | 集成形态 | webview 宿主 + 自托管 EmulatorJS（自写 wrapper 页，经自定义协议加载）；**主窗口 CSP 不放宽** |
| 2 | 资产归属 | vendor 到 `resources/emulator/`，走 `extraResources`；不引入 pnpm 依赖、不改 lock |
| 3 | 存档归属 | 应用持有：主进程落盘 `userData/arcade/`；条目 ID ↔ `EJS_gameID` |
| 4 | ROM 绑定 | 导入拷贝到 `userData/arcade/roms/<entryId>.<ext>`；DB 记 core/title/hash/时间戳 |
| 5 | 卡片模型 | 通用条目表 + 预置两条（中性名，导入后默认取 ROM 文件名，可改名） |
| 6 | 存档粒度 | SRAM 自动持久化 + 退出快照（快照触发点受 S2 约束，见 §6） |

## 2. 依据（已核实的事实）

- 主窗口 CSP（`src/renderer/index.html:7`）无 `wasm-unsafe-eval`、无 `worker-src`，`connect-src` 仅 self + localhost → 渲染进程内跑不了 WASM 核心；放宽等于全应用防线降级（渲染 agent 生成的 Markdown/HTML）→ 走 webview。
- 项目已有 webview + 本地协议先例：`webviewTag: true`（`src/main/index.ts:54`）、`lx-design://`（`src/main/protocols/frontDesignProtocol.ts`，`supportFetchAPI/corsEnabled`，含路径遍历守卫）、`src/renderer/src/env.d.ts:43` 的 webview 类型声明。
- 打包：`package.json` 的 `files: ["out/**"]` + main 侧 `externalizeDepsPlugin()` → 资产放 `node_modules` 打包后大概率丢失；`resources/**` 已走 `extraResources`，dev/prod 都能解析。
- worktree 依赖复用：`scripts/setupWorktreeNodeModules.mjs` 仅在工作区与主仓库的依赖字段与 lock 一致时软链 `node_modules` → 本 feature 引入依赖会强制独立安装 + 原生重编，故不引入。
- EmulatorJS（GPL-3.0，v4）支持完全自托管：下载 release 解压，`EJS_pathtodata` 指本地 `data/`，`loader.js` 本地加载；核心为独立包（`@emulatorjs/core-mgba` 解包 4.1MB，GB 类同）。
- 存档相关文档化接口：`EJS_gameID`（存档/缓存按游戏隔离）、`EJS_fixedSaveInterval`（定时 flush 存档并触发 `saveSaveFiles`）、`EJS_onSaveUpdate`（拿到 SRAM buffer）、`EJS_onSaveSave`/`EJS_onLoadSave`（覆盖默认存/读文件行为）、`EJS_loadStateURL`（**启动时**回灌即时存档）、`EJS_externalFiles`（向 EJS 虚拟 FS 注入文件）、`EJS_cacheConfig`（默认把 ROM 缓存进 IndexedDB，需关闭）、`EJS_threads`（需 COOP/COEP 响应头）、`EJS_Buttons`/`EJS_defaultControls`/`EJS_language`/`EJS_color`。
- 官方明确不建议使用未文档化的内部 API。

## 3. 架构与数据流

```
ArcadeGamePicker（卡片网格，两类卡片共存）
   │ 点击 ROM 卡片
   ▼
ArcadeRomStage（renderer，feature/arcade）
   ├─ 无 ROM → arcadeRomApi.pickRom(entryId) ──► 主进程 dialog + 校验 + 拷贝 + DB 更新
   └─ 有 ROM → <webview src="lx-arcade://game/<entryId>/?theme=…&lang=…">
                        │  协议由主进程提供：wrapper.html、EmulatorJS data/core、ROM、存档
                        ▼
                  wrapper 页（resources/emulator/wrapper.html，无 preload、无 node）
                        └─ EmulatorJS 内核运行，通过 postMessage 上报状态/存档/ESC
```

- **协议只接受 `entryId`，不接受路径**：`lx-arcade://game/<entryId>/...` 由主进程按 DB 解析 ROM 文件、按条目目录解析存档，天然杜绝任意路径读取。
- **wrapper 页参数化**：`core`（gba/gb）、`gameID`（条目 ID）、`theme`（neon/pixel）、`lang`（zh-CN/en-US）由 URL 查询串传入，映射到 `EJS_core`/`EJS_gameID`/`EJS_color`/`EJS_language` 等。
- **桥（postMessage）单向为主**：child → parent：`ready`、`started`、`save`（SRAM buffer，transferable）、`state`（即时存档 buffer）、`escape`、`error`；parent → child：`focus`（仅用于把焦点交还容器）。不传递任何可执行指令，不暴露 Electron API。
- **键盘/ESC**：webview 获得焦点后按键不再冒泡到主窗口（独立进程）→ wrapper 在 capture 阶段监听 Escape 并 `postMessage`，由 ArcadeRomStage 处理为"退出回卡片列表"（SRAM 已定时落盘，不做遮罩/假暂停）。游戏内暂停由 EJS 自带 playPause 按钮承担。
- **窗口尺寸/画面**：wrapper 按 3:2（GBA）/ 10:9（GB）等比居中，容器背景与沉浸式布局沿用 `palette`；EJS 自身负责缩放。
- **缓存**：`EJS_cacheConfig.enabled = false`，避免 ROM 被复制进 IndexedDB。
- **隐藏按钮**：`exitEmulation`（用我们的返回）、`restart`（避免误触丢进度）、`cheat`、netplay、`screenRecord`；保留 playPause/mute/volume/settings/fullscreen/screenshot/saveState/loadState。

## 4. 数据模型与文件布局

DB（新增迁移 `src/main/db/migrations/0012_create_arcade_rom_entry.ts`，沿用 `id INTEGER PRIMARY KEY` + snake_case + `created_at/updated_at TIMESTAMP` 既有约定）：

```sql
CREATE TABLE IF NOT EXISTS arcade_rom_entry (
  id INTEGER PRIMARY KEY,                 -- 同时作为 EJS_gameID（协议 URL 中的 entryId）
  core TEXT NOT NULL DEFAULT 'gba' CHECK (core IN ('gba', 'gb')),
  title TEXT NOT NULL,                    -- 默认取 ROM 文件名，可改名
  rom_path TEXT,                          -- 导入后才有的绝对路径（userData 内）
  rom_hash TEXT,                          -- sha256（导入时计算，用于展示/完整性）
  rom_size INTEGER,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  last_played_at TIMESTAMP
);
```

迁移内预置两条（`id = 1` 为 GBA 槽、`id = 2` 为 GB 槽，中性标题）。

文件系统：

```
userData/arcade/
  roms/<entryId>.<ext>            -- 导入的 ROM（≤64MB 上限）
  saves/<entryId>/sram.sav        -- 游戏内存档（写入前自动 .bak 备份）
  saves/<entryId>/state.sta       -- 即时存档（退出快照/手动快照）
  saves/<entryId>/shots/…         -- 可选（截图，v1 不做）
```

资源（随仓库提交，约 10–15MB）：

```
resources/emulator/
  data/            -- EmulatorJS release（loader.js、emulator.min.js、css、语言文件等）
  data/cores/      -- mgba、gambatte 等核心文件（含 cores.json）
  wrapper.html     -- 自写宿主页（无依赖、无构建步骤）
  MANIFEST.sha256  -- 文件清单与哈希（升级时校验）
  NOTICE.md        -- 版本、来源、核心清单、升级步骤、不提供 ROM 声明
  licenses/        -- EmulatorJS GPL-3.0 全文 + 各核心上游许可
```

新增代码落点（沿用现有分层与命名）：

- `src/shared/contracts/arcadeRom.ts`、`src/shared/ipc/arcadeRomChannels.ts`（唯一契约来源）
- `src/main/services/arcadeRomService.ts`（导入/校验/哈希/改名/删除/存档读写）
- `src/main/protocols/arcadeProtocol.ts`（资产/ROM/存档 + CSP/COOP/COEP/Last-Modified 头）
- `src/main/ipc/arcadeRomHandlers.ts`、`src/preload/api/arcadeRom.ts`
- `src/renderer/src/features/arcade/components/ArcadeRomStage.tsx`、`ArcadeRomCard.tsx`
- `src/renderer/src/features/arcade/hooks/useArcadeRomEntries.ts`
- i18n：`arcade.rom.*`（中英），卡片空态/导入/更换/删除/错误文案

## 5. 实现顺序

1. **S1/S2 spike（硬门禁）**：vendor EmulatorJS + 协议 + 最小 wrapper，做临时"选 ROM 直接跑"路径，手测确认可玩、60fps、音频/键位可用；同时验证 SRAM 写出与回灌闭环。
2. 主进程：迁移 + `arcadeRomService` + 协议（含响应头）+ IPC + preload 契约。
3. renderer：条目状态 + 卡片两态（未导入/已就绪）+ `ArcadeRomStage`（webview + 桥 + 加载/错误态）+ i18n。
4. 存档接线：`EJS_fixedSaveInterval` + `EJS_onSaveUpdate` → 落盘；启动回灌；退出快照（按 S2 结论）。
5. 许可与声明文件、测试、分次中文提交（不自动合并）。

## 6. Spike 门禁与回退

- **S1（必须通过）**：webview + 自定义协议下 EmulatorJS 能加载核心并跑 ROM（WASM 编译、响应头、音频、60fps）。不通过 → 方案回炉（不在主窗口放宽 CSP 的前提下没有替代路径）。
- **S2（决定存档形态）**：需要一条**不碰内部 API** 的 SRAM 回灌路径（候选：`EJS_externalFiles` 注入到核心期望路径；或仅回灌即时存档 + SRAM 由 EJS 存储托管）。若回灌走不通 → 回退为"SRAM 由 EmulatorJS 存储托管 + 我们定期导出备份（导出是文档化钩子）"，需重新确认决策 3；"退出自动写快照"若无文档化触发点，则保留 EJS 自带 saveState/loadState 按钮作为手动快照。
- **S3（可选）**：线程核心（COOP/COEP）。非线程核心够用则不开。

## 7. 验收标准（用户手测）

- 预置两张卡片；未导入时为空态（选择 ROM），可更换、可删除，删除需二次确认。
- 导入 GBA ROM 后可玩且流畅（无卡顿/爆音）；GB ROM 同样可玩；默认键位可用；音量/全屏/设置可用。
- 退出游戏厅再进入、关闭应用重开后，游戏内存档仍在。
- 换 ROM（重复导入）条目不变、存档保留并有提示。
- 断网环境可用；主窗口 CSP 原文未修改；打包（`pnpm build`）后模拟器仍能加载。
- 无 ROM/文件损坏时给出明确错误态，不崩、可重试。

## 8. 测试计划

- 主进程：导入校验（扩展名白名单/大小上限/路径守卫/覆盖语义/哈希）、改名与删除、存档读写与 `.bak` 备份、协议 handler（403/404、CSP/COOP/COEP/Last-Modified 头、只认 entryId）。
- renderer：卡片两态渲染、i18n 键齐全、`ArcadeRomStage` 在 jsdom 下 mock webview 的状态机（加载/启动/错误/退出）。
- 不自动测：真实模拟器运行与手感（用户手测）；spike 结论以手测记录为准。

## 9. 风险与未决

- 仓库 +10–15MB 二进制（拒绝 git-lfs；升级靠手动替换 + `MANIFEST` 校验）。
- GPL-3.0 合规：随分发附全文与出处；不改其代码即不传染本项目代码（不得把 EmulatorJS 代码并入我们的 bundle）。
- 存档回灌路径未验证（S2）；SRAM 注入失败将触发决策 3 回退。
- ESC 直接退出可能误触（存档已落盘，代价可接受）；若体感差，再评估确认弹窗。
- EJS 自带界面与主题/i18n 的观感一致性有限（只做颜色/语言参数注入）。
