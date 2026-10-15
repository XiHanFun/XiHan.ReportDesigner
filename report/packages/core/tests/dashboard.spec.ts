/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView, MetricCard, QueryResult } from '../src'
import { describe, expect, it } from 'vitest'
import { cardDimension, computeMetric, ReportComputeError, resolveLinkFilters, runQuery } from '../src'
import { salesData, salesDataset } from './fixtures'

const layout = { x: 0, y: 0, w: 4, h: 3 }

const dashboard: DashboardView = {
  type: 'dashboard',
  grid: { columns: 12, rowHeight: 48 },
  cards: [
    {
      id: 'byMonth',
      kind: 'chart',
      layout,
      dataset: 'sales',
      query: {
        dimensions: [{ id: 'month', field: 'date', bucket: 'month' }],
        measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }],
      },
      chart: { type: 'cartesian', series: [{ id: 's', mark: 'line', x: 'month', y: 'amount' }] },
    },
    {
      id: 'byRegion',
      kind: 'chart',
      layout: { ...layout, x: 4 },
      dataset: 'sales',
      query: {
        dimensions: [{ id: 'region', field: 'region' }],
        measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }],
      },
      chart: { type: 'pie', nameField: 'region', valueField: 'amount' },
    },
    {
      id: 'list',
      kind: 'table',
      layout: { ...layout, x: 8 },
      view: { type: 'table', dataset: 'sales', columns: [{ id: 'who', field: 'region' }, { id: 'amount', field: 'amount' }] },
    },
  ],
  links: [
    { id: 'month', card: 'byMonth', dimension: 'month', targets: [{ card: 'byRegion', field: 'date' }, { card: 'list', field: 'date' }] },
    { id: 'region', card: 'list', dimension: 'who', targets: [{ card: 'byRegion', field: 'region' }] },
  ],
}

describe('resolveLinkFilters', () => {
  it('选中值成为目标卡片的 in 条件，带源维度的日期粒度', () => {
    expect(resolveLinkFilters(dashboard, { month: ['2026-01'], region: ['East', 'West'] })).toEqual({
      byRegion: [
        { id: 'link:month', field: 'date', bucket: 'month', operator: 'in', value: ['2026-01'] },
        { id: 'link:region', field: 'region', operator: 'in', value: ['East', 'West'] },
      ],
      list: [
        { id: 'link:month', field: 'date', bucket: 'month', operator: 'in', value: ['2026-01'] },
      ],
    })
  })

  it('没有选中时不产生条件', () => {
    expect(resolveLinkFilters(dashboard, { month: [] })).toEqual({})
  })

  it('联动条件交给查询后只算选中的部分', () => {
    const filters = resolveLinkFilters(dashboard, { month: ['2026-01'] })
    const card = dashboard.cards[1]!
    if (card.kind !== 'chart')
      throw new Error('fixture')
    const result = runQuery(card.query, salesDataset, salesData, { filters: filters.byRegion })
    expect(result.rows).toEqual([{ region: 'East', amount: 100 }, { region: 'West', amount: 80 }])
  })

  it('源卡片或源维度不存在时抛出', () => {
    const broken: DashboardView = { ...dashboard, links: [{ id: 'x', card: 'nope', dimension: 'month', targets: [] }] }
    expect(() => resolveLinkFilters(broken, { x: ['a'] })).toThrowError(ReportComputeError)
    const missing: DashboardView = { ...dashboard, links: [{ id: 'x', card: 'byMonth', dimension: 'nope', targets: [] }] }
    expect(() => resolveLinkFilters(missing, { x: ['a'] })).toThrowError(ReportComputeError)
  })

  it('cardDimension 按卡片类型找维度', () => {
    expect(cardDimension(dashboard.cards[0]!, 'month')).toMatchObject({ field: 'date', bucket: 'month' })
    expect(cardDimension(dashboard.cards[2]!, 'who')).toEqual({ field: 'region' })
    expect(cardDimension(dashboard.cards[2]!, 'month')).toBeUndefined()
  })
})

describe('computeMetric', () => {
  const card: MetricCard = {
    id: 'm',
    kind: 'metric',
    layout,
    dataset: 'sales',
    query: {
      dimensions: [{ id: 'month', field: 'date', bucket: 'month' }],
      measures: [
        { id: 'amount', aggregate: 'sum', field: 'amount' },
        { id: 'qty', aggregate: 'sum', field: 'qty' },
      ],
    },
    metric: { value: 'amount', baseline: 'qty', sparkline: { x: 'month', y: 'amount' } },
  }

  it('取查询总计，比出涨跌与变化率', () => {
    const result = runQuery(card.query, salesDataset, salesData)
    expect(computeMetric(card.metric, result)).toEqual({ value: 280, baseline: 12, trend: 'up', change: 280 / 12 - 1 })
    expect(result.rows.map(row => row.amount)).toEqual([180, 50, 50])
  })

  it('缺少基准或值不是数值时没有涨跌', () => {
    const total = (values: Record<string, unknown>): QueryResult => ({ rows: [], total: values })
    expect(computeMetric({ value: 'a' }, total({ a: 5 }))).toEqual({ value: 5, baseline: null, trend: null, change: null })
    expect(computeMetric({ value: 'a', baseline: 'b' }, total({ a: null, b: 3 }))).toEqual({ value: null, baseline: 3, trend: null, change: null })
    expect(computeMetric({ value: 'a', baseline: 'b' }, total({ a: 3, b: 0 }))).toEqual({ value: 3, baseline: 0, trend: 'up', change: null })
    expect(computeMetric({ value: 'a', baseline: 'b' }, total({ a: 2, b: 2 }))).toMatchObject({ trend: 'flat', change: 0 })
    expect(computeMetric({ value: 'a', baseline: 'b' }, total({ a: 1, b: 2 }))).toMatchObject({ trend: 'down', change: -0.5 })
  })
})
