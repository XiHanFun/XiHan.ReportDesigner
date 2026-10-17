/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 卡片种类与新卡片的模板：每种卡片一份字段绑定留空的定义与缺省大小。

import type { NewCard, NewExtensionCard } from './grid'
import type { ChartSpec } from './schema/chart'
import type { ReportExtensionKind } from './schema/extension'
import type { DashboardCard, TableCard } from './schema/view'
import { CHART_TYPES } from './schema/chart'

/** 卡片种类：chart.<图表类型>、metric、table.<视图类型>。 */
export type ReportCardType = `chart.${ChartSpec['type']}` | 'metric' | `table.${TableCard['view']['type']}`

/** 全部卡片种类：图表、指标、表格依次排列。 */
export const REPORT_CARD_TYPES: readonly ReportCardType[] = [
  ...CHART_TYPES.map(type => `chart.${type}` as const),
  'metric',
  'table.table',
  'table.group',
  'table.crosstab',
]

/** 新卡片的模板：除 id 外的定义，layout 只写大小。 */
/** 内置种类的新卡片模板。 */
export type CardTemplate = Exclude<NewCard, NewExtensionCard> extends infer C ? C extends NewCard ? Omit<C, 'id'> : never : never

/** 卡片的种类：内置的按图表或视图类型细分，扩展卡片就是它的种类名。 */
export function cardTypeOf(card: DashboardCard): ReportCardType | ReportExtensionKind {
  if (card.kind === 'chart')
    return `chart.${card.chart.type}`
  if (card.kind === 'table')
    return `table.${card.view.type}`
  if (card.kind === 'metric')
    return 'metric'
  return card.kind
}

function chartSpec(type: ChartSpec['type']): ChartSpec {
  switch (type) {
    case 'cartesian':
      return { type, series: [] }
    case 'pie':
    case 'funnel':
      return { type, nameField: '', valueField: '' }
    case 'radar':
      return { type, nameField: '', indicators: [] }
    case 'sankey':
      return { type, sourceField: '', targetField: '', valueField: '' }
    case 'heatmap':
      return { type, variant: 'matrix', rowField: '', columnField: '', valueField: '' }
    case 'hierarchy':
      return { type, levels: [], valueField: '' }
  }
}

/**
 * 新卡片的模板：取数用 dataset，查询、图表与视图里的字段绑定都留空（空字符串或空列表），由设计器随后填上。
 * 指标卡片缺省 3 × 3 格，其余 6 × 8 格；种类不认识时抛 RangeError。
 */
export function cardTemplate(type: ReportCardType, dataset: string): CardTemplate {
  const query = { dimensions: [], measures: [] }
  if (type === 'metric')
    return { kind: 'metric', layout: { w: 3, h: 3 }, dataset, query, metric: { value: '' } }
  const layout = { w: 6, h: 8 }
  switch (type) {
    case 'table.table':
      return { kind: 'table', layout, view: { type: 'table', dataset, columns: [] } }
    case 'table.group':
      return { kind: 'table', layout, view: { type: 'group', dataset, groups: [], columns: [] } }
    case 'table.crosstab':
      return { kind: 'table', layout, view: { type: 'crosstab', dataset, rows: [], columns: [], measures: [] } }
  }
  const chart = type.slice('chart.'.length) as ChartSpec['type']
  if (!CHART_TYPES.includes(chart))
    throw new RangeError(`[report] unknown card type "${String(type)}"`)
  return { kind: 'chart', layout, dataset, query, chart: chartSpec(chart) }
}
