/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 示例扩展 @acme/goal 的运行时层：在 core 层之上加进度卡片的渲染（UI 的 <xh-progress>）、给达成目标的卡片垫一圈描边的
// 叠加层、把各进度卡片导出成 CSV 的导出器，以及记下每次取数耗时的取数中间件。

import type { ReportRuntimeExtension } from '@xihan-report/runtime'
import type { GoalValue } from './goal-core.ts'
import { defineXhElement, XhProgressElement } from '@xihan-ui/web-components/define'
import { goalCore } from './goal-core.ts'

/** 取数中间件记下的一次取数。 */
export interface FetchRecord {
  readonly dataset: string
  readonly milliseconds: number
}

// #region progress
/** 线形进度条：<xh-progress> 里写 root > track > range 三层部件。 */
function createProgress(): XhProgressElement {
  const part = (name: string): HTMLDivElement => {
    const node = document.createElement('div')
    node.dataset.xhPart = name
    return node
  }
  const root = part('root')
  const track = part('track')
  track.append(part('range'))
  root.append(track)
  const progress = document.createElement('xh-progress') as XhProgressElement
  progress.append(root)
  return progress
}
// #endregion progress

/** 建运行时层的扩展；onFetch 收到每次取数的耗时。建一次、引用保持不变，查看器只合并一次。 */
export function createGoalRuntime(onFetch: (record: FetchRecord) => void): ReportRuntimeExtension {
  defineXhElement('xh-progress', XhProgressElement)
  return {
    ...goalCore,
    // #region renderer
    cardRenderers: {
      'goal.progress': (body, result, context) => {
        const { value, target } = result.value as GoalValue
        const progress = body.querySelector<XhProgressElement>('xh-progress') ?? createProgress()
        const caption = body.querySelector('p') ?? document.createElement('p')
        progress.max = target
        progress.value = Math.min(value, target)
        progress.setAttribute('aria-label', result.card.title ?? result.card.id)
        progress.tone = value >= target ? 'success' : 'brand'
        caption.textContent = `${context.text(value, { kind: 'number', grouping: true }, 'number')} / ${context.text(target, { kind: 'number', grouping: true }, 'number')}`
        if (progress.parentElement !== body || caption.parentElement !== body)
          body.replaceChildren(progress, caption)
        return undefined
      },
    },
    // #endregion renderer
    // #region overlay
    overlays: [{
      id: '@acme/goal.reached',
      layer: 'below',
      render: (container, scene) => {
        container.replaceChildren(...scene.cards.flatMap((item) => {
          const goal = item.result?.value as GoalValue | undefined
          if (item.card.kind !== 'goal.progress' || item.status !== 'ready' || goal === undefined || goal.value < goal.target)
            return []
          const halo = document.createElement('div')
          Object.assign(halo.style, {
            position: 'absolute',
            boxSizing: 'border-box',
            left: `calc(${item.rect.x}px - var(--xh-space-1))`,
            top: `calc(${item.rect.y}px - var(--xh-space-1))`,
            width: `calc(${item.rect.width}px + 2 * var(--xh-space-1))`,
            height: `calc(${item.rect.height}px + 2 * var(--xh-space-1))`,
            borderRadius: 'var(--xh-radius-md)',
            border: 'var(--xh-stroke-thick) solid var(--xh-fg-success)',
          })
          return [halo]
        }))
      },
    }],
    // #endregion overlay
    // #region exporter
    exporters: [{
      id: '@acme/goal.csv',
      label: 'CSV',
      formats: ['csv'],
      export: async (_format, context) => {
        const lines = context.results.cards
          .filter(item => item.result.card.kind === 'goal.progress')
          .map((item) => {
            const goal = item.result.value as GoalValue
            return [item.result.card.title ?? item.result.card.id, goal.value, goal.target].join(',')
          })
        return ['卡片,完成值,目标', ...lines].join('\n')
      },
    }],
    // #endregion exporter
    // #region middleware
    dataProvider: next => async (request, context) => {
      const started = performance.now()
      try {
        return await next(request, context)
      }
      finally {
        onFetch({ dataset: request.dataset, milliseconds: Math.round(performance.now() - started) })
      }
    },
    // #endregion middleware
  }
}
