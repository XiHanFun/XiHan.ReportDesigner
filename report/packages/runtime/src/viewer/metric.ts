/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 指标卡片：xh-statistic 写标签、汇总值与涨跌（数值由 formatter 写成文字后放进槽里），有走势时再放一条 xh-sparkline。
// 指标卡片不另写卡片标题，标签就是标题：卡片写了 title 时取它，否则取度量标题。

import type { DatasetSchema, MetricCard, MetricResult, QueryResult } from '@xihan-report/core'
import type { RenderContext } from './context'
import { measureLabel, measureType } from '../labels'
import { svgPart, uiPart } from './dom'

/** 涨跌幅的显示格式。 */
const CHANGE_FORMAT = { kind: 'percent', decimals: 1 } as const

/** 把指标卡片排成元素，返回卡片内容的根节点。 */
export function renderMetric(card: MetricCard, result: QueryResult, metric: MetricResult, dataset: DatasetSchema, ctx: RenderContext): HTMLElement {
  const spec = card.metric
  const measure = card.query.measures.find(item => item.id === spec.value)
  const label = card.title ?? (measure ? measureLabel(measure, dataset) : spec.value)
  const content = document.createElement('div')
  content.dataset.part = 'metric'

  const statistic = document.createElement('xh-statistic')
  if (spec.size)
    statistic.setAttribute('size', spec.size)
  if (spec.tone)
    statistic.setAttribute('tone', spec.tone)
  if (metric.trend)
    statistic.setAttribute('trend', metric.trend)
  const root = uiPart('div', 'root')
  root.append(uiPart('span', 'label', {}, label))
  if (spec.prefix !== undefined)
    root.append(uiPart('span', 'prefix', {}, spec.prefix))
  root.append(uiPart('span', 'value', {}, ctx.text(metric.value, spec.format, measure ? measureType(measure, dataset) : undefined, '—')))
  if (spec.suffix !== undefined)
    root.append(uiPart('span', 'suffix', {}, spec.suffix))
  if (metric.change !== null)
    root.append(uiPart('span', 'trend', {}, ctx.text(Math.abs(metric.change), CHANGE_FORMAT, undefined)))
  statistic.append(root)
  content.append(statistic)

  if (spec.sparkline) {
    const { x, y, ...style } = spec.sparkline
    const sparkline = document.createElement('xh-sparkline')
    const svg = svgPart('root')
    svg.setAttribute('aria-label', label)
    sparkline.append(svg)
    Object.assign(sparkline, style, { data: result.rows, x, y })
    content.append(sparkline)
  }
  return content
}
