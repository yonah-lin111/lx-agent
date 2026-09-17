# EmulatorJS 运行时资产（自托管）

本目录是 LX Agent 内置的 GBA 模拟器运行时，来自 EmulatorJS v4.2.3 官方 npm 发布包：

- EmulatorJS 本体：`@emulatorjs/emulatorjs@4.2.3`（GPL-3.0，https://github.com/EmulatorJS/EmulatorJS ）
- mgba 核心：`@emulatorjs/core-mgba@4.2.3`（构建自 https://github.com/EmulatorJS/mgba ，上游 mGBA 为 MPL-2.0）

## 目录结构

- `data/loader.js`、`data/emulator.css`、`data/src/`：EmulatorJS 未压缩源码（便于满足 GPL 源码分发义务）
- `data/localization/`、`data/compression/`：语言包与压缩包解压器（zip/7z/rar）
- `data/cores/mgba-wasm.data`、`data/cores/mgba-legacy-wasm.data`：7z 打包的 mgba 核心（WebGL2 / legacy 两档）
- `data/cores/reports/mgba.json`：核心构建报告（版本与缓存键）
- `licenses/`：EmulatorJS GPL-3.0 全文、mgba-MPL-2.0 全文
- `wrapper.html`、`wrapper.js`：宿主页（无 Node、无网络请求，仅经 `lx-game://` 协议加载本目录）
- `guest-preload.cjs`：webview 预加载桥（仅暴露上报/接收两个函数，不暴露任何 Node 能力）

## 法律边界（不可协商）

本目录不包含、不下载、不链接任何 ROM 或 ROM 站点。ROM 由用户自行导入，版权与来源由用户负责；仓库内不出现具体作品名。

## 升级步骤

1. 从 npm registry 拉取 `@emulatorjs/emulatorjs@<version>` 与 `@emulatorjs/core-mgba@<version>` 的 tarball；
2. 按上述结构覆盖 `data/`、核心文件与 `reports/`；
3. 同步更新本文件顶部版本号与 `licenses/` 内容；
4. 核对 `data/cores/reports/mgba.json` 的 `minimumEJSVersion` 与本体版本兼容。
