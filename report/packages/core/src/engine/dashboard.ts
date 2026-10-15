/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 看板：卡片查找、联动筛选与指标卡片的取值。

import type { DashboardCard, DashboardView, DateBucket, FilterCondition, MetricSpec, ScalarValue } from '../schema'
import type { QueryResult } from './query'
import { isMissing } from '@xihan-ui/viz'
import { ReportComputeError } from './errors'

/** 联动的选中值：联动 id 到源维度上选中的取值；空数组或缺项表示没有选中。 */
export type LinkSelections = Readonly<Record<string, readonly ScalarValue[]>>

/** 卡片上一个可发出取值的维度。 */
export interface CardDimension {
  readonly field: string
  readonly bucket?: DateBucket
}

/** 指标卡片的取值。 */
export interface MetricResult {
  /** 显示的值：查询总计里 value 度量的值；缺失为 null。 */
  readonly value: unknown
  /** 对比基准：查询总计里 baseline 度量的值；没有基准或缺失为 null。 */
  readonly baseline: unknown
  /** 涨跌：两者都是有限数值时比出，否则为 null。 */
  readonly trend: 'up' | 'down' | 'flat' | null
  /** 变化率 value / baseline − 1；两者不都是有限数值或基准为 0 时为 null。 */
  readonly change: number | null
}

/** 按 id 找卡片。 */
export function findCard(dashboard: DashboardView, id: string): DashboardCard | undefined {
  return dashboard.cards.find(card => card.id === id)
}

/**
 * 卡片上的一个维度：图表与指标卡片是查询的维度，表格卡片按视图类型是明细表的列、
 * 分组报表的分组、交叉表的行列维度。没有该维度时为 undefined。
 */
export function cardDimension(card: DashboardCard, id: string): CardDimension | undefined {
  if (card.kind !== 'table')
    return card.query.dimensions.find(dimension => dimension.id === id)
  const view = card.view
  switch (view.type) {
    case 'table': {
      const column = view.columns.find(item => item.id === id)
      return column ? { field: column.field } : undefined
    }
    case 'group':
      return view.groups.find(group => group.id === id)
    case 'crosstab':
      return [...view.rows, ...view.columns].find(dimension => dimension.id === id)
  }
}

/**
 * 把联动的选中值换成各目标卡片的筛选条件：每个目标得到 field in 选中值，
 * 源维度带日期粒度时条件带同一粒度。同一张卡片收到的多个条件同时满足。
 * 源卡片或源维度不存在时抛出 unknown-card / unknown-dimension。
 */
export function resolveLinkFilters(dashboard: DashboardView, selections: LinkSelections): Readonly<Record<string, readonly FilterCondition[]>> {
  const result: Record<string, FilterCondition[]> = {}
  for (const link of dashboard.links ?? []) {
    const values = selections[link.id]
    if (!values || values.length === 0)
      continue
    const source = findCard(dashboard, link.card)
    if (!source)
      throw new ReportComputeError('unknown-card', { link: link.id, card: link.card })
    const dimension = cardDimension(source, link.dimension)
    if (!dimension)
      throw new ReportComputeError('unknown-dimension', { link: link.id, card: link.card, dimension: link.dimension })
    for (const target of link.targets) {
      const condition: FilterCondition = dimension.bucket
        ? { id: `link:${link.id}`, field: target.field, bucket: dimension.bucket, operator: 'in', value: values }
        : { id: `link:${link.id}`, field: target.field, operator: 'in', value: values }
      ;(result[target.card] ??= []).push(condition)
    }
  }
  return result
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 指标卡片的取值：从查询总计里取 value 与 baseline，比出涨跌与变化率。 */
export function computeMetric(metric: MetricSpec, result: QueryResult): MetricResult {
  const read = (id: string | undefined): unknown => {
    if (id === undefined)
      return null
    const value = result.total[id]
    return isMissing(value) ? null : value
  }
  const value = read(metric.value)
  const baseline = read(metric.baseline)
  const current = finiteOrNull(value)
  const base = finiteOrNull(baseline)
  if (current === null || base === null)
    return { value, baseline, trend: null, change: null }
  return {
    value,
    baseline,
    trend: current > base ? 'up' : current < base ? 'down' : 'flat',
    change: base === 0 ? null : current / base - 1,
  }
}
