import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', design: 'src/design.ts', locale: 'src/locale.ts', xlsx: 'src/xlsx/index.ts' },
  format: ['esm'],
  platform: 'neutral',
  dts: true,
  clean: true,
  treeshake: true,
  deps: {
    neverBundle: [/^@xihan-report\//, /^@xihan-ui\//],
  },
  checks: {
    pluginTimings: false,
  },
})
