/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 指标卡片：xh-statistic 写标签、汇总值与涨跌（数值由 formatter 写成文字后放进槽里），有走势时再放一条 xh-sparkline。
// 指标卡片不另写卡片标题，标签就是标题：卡片写了 title 时取它，否则取度量标题。
// 上一轮绘的也是指标卡片时复用那两个元素，只换文字与属性。

import type { DatasetSchema, MetricCard, MetricResult, QueryResult } from '@xihan-report/core'
import type { RenderContext } from './context'
import { measureLabel, measureType } from '../labels'
import { svgPart, uiPart } from './dom'

/** 涨跌幅的显示格式。 */
const CHANGE_FORMAT = { kind: 'percent', decimals: 1 } as const

/** 写或删一个属性；值没变不写。 */
function setAttribute(element: Element, name: string, value: string | undefined): void {
  if (value === undefined)
    element.removeAttribute(name)
  else if (element.getAttribute(name) !== value)
    element.setAttribute(name, value)
}

/** 走势线上一轮赋过的属性名：这一轮没有的设回 undefined。 */
const sparklineProps = new WeakMap<Element, readonly string[]>()

/**
 * 把指标卡片排成元素，返回卡片内容的根节点。previous 是上一轮绘的内容根节点：也是指标卡片时复用其中的
 * xh-statistic 与 xh-sparkline，只换文字与属性。
 */
export function renderMetric(card: MetricCard, result: QueryResult, metric: MetricResult, dataset: DatasetSchema, ctx: RenderContext, previous?: Element | null): HTMLElement {
  const spec = card.metric
  const measure = card.query.measures.find(item => item.id === spec.value)
  const label = card.title ?? (measure ? measureLabel(measure, dataset) : spec.value)
  const reused = previous instanceof HTMLElement && previous.dataset.part === 'metric' ? previous : undefined
  const content = reused ?? document.createElement('div')
  content.dataset.part = 'metric'

  let statistic = content.querySelector(':scope > xh-statistic')
  if (!statistic) {
    statistic = document.createElement('xh-statistic')
    content.prepend(statistic)
  }
  setAttribute(statistic, 'size', spec.size)
  setAttribute(statistic, 'tone', spec.tone)
  setAttribute(statistic, 'trend', metric.trend ?? undefined)
  const root = statistic.querySelector(':scope > [data-xh-part="root"]') ?? statistic.appendChild(uiPart('div', 'root'))
  const parts = [uiPart('span', 'label', {}, label)]
  if (spec.prefix !== undefined)
    parts.push(uiPart('span', 'prefix', {}, spec.prefix))
  parts.push(uiPart('span', 'value', {}, ctx.text(metric.value, spec.format, measure ? measureType(measure, dataset) : undefined, '—')))
  if (spec.suffix !== undefined)
    parts.push(uiPart('span', 'suffix', {}, spec.suffix))
  if (metric.change !== null)
    parts.push(uiPart('span', 'trend', {}, ctx.text(Math.abs(metric.change), CHANGE_FORMAT, undefined)))
  root.replaceChildren(...parts)

  let sparkline = content.querySelector(':scope > xh-sparkline')
  if (!spec.sparkline) {
    sparkline?.remove()
    return content
  }
  const { x, y, ...style } = spec.sparkline
  if (!sparkline) {
    sparkline = document.createElement('xh-sparkline')
    sparkline.append(svgPart('root'))
    content.append(sparkline)
  }
  sparkline.querySelector(':scope > [data-xh-part="root"]')?.setAttribute('aria-label', label)
  const props: Record<string, unknown> = { ...style, data: result.rows, x, y }
  const target = sparkline as unknown as Record<string, unknown>
  for (const key of sparklineProps.get(sparkline) ?? []) {
    if (!(key in props))
      target[key] = undefined
  }
  Object.assign(sparkline, props)
  sparklineProps.set(sparkline, Object.keys(props))
  return content
}
