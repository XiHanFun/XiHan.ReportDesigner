<script setup lang="ts">
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 示例舞台：在浏览器里载入 examples/demos/<name>.ts 或 <name>.vue。.ts 示例导出 mount，挂到舞台上，卸载时调用它返回的清理函数；
// .vue 示例是一个组件，直接渲染在舞台里。
// 舞台里的看板查看器按网格的范围定行高：整块看板高过一屏时，换一份行高小一些的报表给它，各张卡片一屏看完；
// 只在示例里换，示例报表本身不改。写了 fullscreen 的示例可以全屏，全屏时舞台里的设计器长到屏幕底。

import type { ReportDocument } from '@xihan-report/core'
import type { Component } from 'vue'
import { XhFullscreen } from '@xihanfun/vitepress-theme'
import { markRaw, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

interface DemoModule {
  mount?: (host: HTMLElement) => () => void
  default?: Component
}

const props = defineProps<{ name: string, fullscreen?: boolean }>()

/** 看板行高的下限（px）：再矮，卡片标题与指标都挤不下。 */
const MIN_ROW_HEIGHT = 24

const demos = import.meta.glob<DemoModule>('../../examples/demos/*.{ts,vue}')
const stage = ref<HTMLElement>()
const component = shallowRef<Component>()
const missing = ref(false)
let dispose: (() => void) | undefined
let unmounted = false
let resize: ResizeObserver | undefined
/** 每个查看器上示例自己给的报表，与舞台换给它的那一份。 */
const fitted = new WeakMap<Element, { readonly original: ReportDocument, readonly applied: ReportDocument }>()

/**
 * 一屏能给看板的高度：视口高减去顶栏与舞台的留白，上限与设计器示例一致。
 * 行高 = (这个高度 − 查看器里网格以外的部分 − 行距 × (行数 − 1)) ÷ 行数，夹在下限与报表原来的行高之间。
 */
function fitDashboards(): void {
  const root = stage.value
  if (!root)
    return
  const available = Math.min(860, Math.max(320, innerHeight - 160))
  for (const viewer of root.querySelectorAll<HTMLElement & { schema?: ReportDocument }>('xh-report-viewer')) {
    const current = viewer.schema
    const grid = viewer.querySelector<HTMLElement>('[data-part="dashboard"]')
    if (!current || !grid)
      continue
    const entry = fitted.get(viewer)
    const original = entry && entry.applied === current ? entry.original : current
    const body = original.body
    if (body.type !== 'dashboard' || body.cards.length === 0)
      continue
    const rows = Math.max(...body.cards.map(card => card.layout.y + card.layout.h))
    const gap = Number.parseFloat(getComputedStyle(grid).rowGap) || 0
    const other = viewer.getBoundingClientRect().height - grid.getBoundingClientRect().height
    const fit = Math.floor((available - other - gap * (rows - 1)) / rows)
    const rowHeight = Math.max(MIN_ROW_HEIGHT, Math.min(body.grid.rowHeight, fit))
    // 已经是这个行高就不动：每次赋值都会重新取数
    if (current.body.type === 'dashboard' && current.body.grid.rowHeight === rowHeight) {
      fitted.set(viewer, { original, applied: current })
      continue
    }
    const next = rowHeight === body.grid.rowHeight ? original : { ...original, body: { ...body, grid: { ...body.grid, rowHeight } } }
    fitted.set(viewer, { original, applied: next })
    viewer.schema = next
  }
}

onMounted(async () => {
  const load = demos[`../../examples/demos/${props.name}.ts`] ?? demos[`../../examples/demos/${props.name}.vue`]
  if (load === undefined) {
    missing.value = true
    return
  }
  const demo = await load()
  if (unmounted)
    return
  if (demo.mount !== undefined && stage.value !== undefined)
    dispose = demo.mount(stage.value)
  else if (demo.default !== undefined)
    component.value = markRaw(demo.default)
  // 查看器装上报表、画好网格以后舞台的大小会变；视口变高变矮时舞台的宽不变，另听窗口
  if (stage.value !== undefined && typeof ResizeObserver === 'function') {
    resize = new ResizeObserver(fitDashboards)
    resize.observe(stage.value)
  }
  addEventListener('resize', fitDashboards)
})

onBeforeUnmount(() => {
  unmounted = true
  resize?.disconnect()
  removeEventListener('resize', fitDashboards)
  dispose?.()
})
</script>

<template>
  <div class="report-demo">
    <p v-if="missing" class="report-demo__missing">
      找不到示例 {{ props.name }}
    </p>
    <XhFullscreen v-else-if="props.fullscreen">
      <div ref="stage" class="report-demo__stage">
        <component :is="component" v-if="component" />
      </div>
    </XhFullscreen>
    <div v-else ref="stage" class="report-demo__stage">
      <component :is="component" v-if="component" />
    </div>
  </div>
</template>
