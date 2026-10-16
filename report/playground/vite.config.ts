/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 开发预览页：@xihan-report/* 直接指向各包源码，改了源码即时生效，不必先构建；@xihan-ui/* 经 overrides 读同级 XiHan.UI 的产物。

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

function local(path: string): string {
  return fileURLToPath(new URL(`../packages/${path}`, import.meta.url))
}

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@xihan-report\/core$/, replacement: local('core/src/index.ts') },
      { find: /^@xihan-report\/runtime$/, replacement: local('runtime/src/index.ts') },
      { find: /^@xihan-report\/runtime\/locale$/, replacement: local('runtime/src/locale.ts') },
      { find: /^@xihan-report\/runtime\/xlsx$/, replacement: local('runtime/src/xlsx/index.ts') },
      { find: /^@xihan-report\/runtime\/style\.css$/, replacement: local('runtime/style.css') },
    ],
  },
  server: {
    port: 5193,
    strictPort: true,
  },
})
