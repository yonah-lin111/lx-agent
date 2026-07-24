import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@shared",
        replacement: resolve(process.cwd(), "src/shared"),
      },
      {
        find: /^@\/(.*)$/,
        replacement: "$1",
        customResolver(source, importer) {
          const root =
            importer?.includes("/src/main/") || importer?.includes("/test/main/")
              ? "src/main"
              : "src/renderer/src"
          const path = resolve(process.cwd(), root, source)

          for (const extension of [".ts", ".tsx", ".js", ".jsx", ".json"]) {
            if (existsSync(path + extension)) {
              return path + extension
            }

            if (existsSync(resolve(path, `index${extension}`))) {
              return resolve(path, `index${extension}`)
            }
          }

          return path
        },
      },
    ],
  },
  test: { exclude: [...configDefaults.exclude, ".worktrees/**"] },
})
