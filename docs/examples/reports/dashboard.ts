/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 看板与卡片：三张指标卡片、按月堆叠的柱图、区域占比的环形图与一张金额最高的订单表。

import type { ChartCard, DashboardView, MetricCard, ReportDocument, TableCard } from '@xihan-report/core'
import { salesDataset, salesRows } from '../data/sales.ts'

const money = { kind: 'number', decimals: 0, grouping: true } as const
const month = { id: 'month', field: 'date', bucket: 'month', title: '月份' } as const
const amount = { id: 'amount', field: 'amount', aggregate: 'sum', title: '销售额', format: money } as const

// #region metric
const sales: MetricCard = {
  id: 'sales',
  kind: 'metric',
  layout: { x: 0, y: 0, w: 4, h: 4 },
  dataset: 'sales',
  query: {
    dimensions: [month],
    measures: [amount, { id: 'target', title: '目标', formula: '200000' }],
  },
  metric: { value: 'amount', baseline: 'target', prefix: '¥', sparkline: { x: 'month', y: 'amount' } },
}
// #endregion metric

const orders: MetricCard = {
  id: 'orders',
  kind: 'metric',
  layout: { x: 4, y: 0, w: 4, h: 4 },
  dataset: 'sales',
  query: { dimensions: [], measures: [{ id: 'orders', aggregate: 'count', title: '订单数' }] },
  metric: { value: 'orders' },
}

const quantity: MetricCard = {
  id: 'quantity',
  kind: 'metric',
  layout: { x: 8, y: 0, w: 4, h: 4 },
  dataset: 'sales',
  query: { dimensions: [], measures: [{ id: 'quantity', field: 'quantity', aggregate: 'sum', title: '销量' }] },
  metric: { value: 'quantity', suffix: '件' },
}

// #region chart
const trend: ChartCard = {
  id: 'trend',
  kind: 'chart',
  title: '月度销售额',
  layout: { x: 0, y: 4, w: 8, h: 7 },
  dataset: 'sales',
  query: { dimensions: [month, { id: 'category', field: 'category', title: '品类' }], measures: [amount] },
  chart: {
    type: 'cartesian',
    splitBy: 'category',
    series: [{ id: 'amount', mark: 'bar', x: 'month', y: 'amount', stack: 'total' }],
  },
}
// #endregion chart

const regions: ChartCard = {
  id: 'regions',
  kind: 'chart',
  title: '区域占比',
  layout: { x: 8, y: 4, w: 4, h: 7 },
  dataset: 'sales',
  query: { dimensions: [{ id: 'region', field: 'region', title: '区域' }], measures: [amount] },
  chart: { type: 'pie', nameField: 'region', valueField: 'amount', variant: 'donut' },
}

// #region table
const top: TableCard = {
  id: 'top',
  kind: 'table',
  title: '金额最高的订单',
  layout: { x: 0, y: 11, w: 12, h: 6 },
  view: {
    type: 'table',
    dataset: 'sales',
    columns: [
      { id: 'orderId', field: 'orderId', width: 150 },
      { id: 'date', field: 'date' },
      { id: 'region', field: 'region' },
      { id: 'category', field: 'category' },
      { id: 'amount', field: 'amount', align: 'end', format: money },
    ],
    sort: [{ field: 'amount', direction: 'desc' }],
    limit: 8,
  },
}
// #endregion table

// #region dashboard
const body: DashboardView = {
  type: 'dashboard',
  grid: { columns: 12, rowHeight: 40 },
  cards: [sales, orders, quantity, trend, regions, top],
}
// #endregion dashboard

export const schema: ReportDocument = {
  schemaVersion: 1,
  id: 'overview',
  title: '销售看板',
  datasets: [salesDataset],
  body,
}

export const rows = salesRows
