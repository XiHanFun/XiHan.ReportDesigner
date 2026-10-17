/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 联动与下钻：点环形图的区域，筛选柱图与明细表；点柱图的月份，筛选明细表；明细表的格子报出行主操作供宿主下钻。

import type { DashboardLink, DashboardView, ReportDocument } from '@xihan-report/core'
import { salesDataset, salesRows } from '../data/sales.ts'

const money = { kind: 'number', decimals: 0, grouping: true } as const
const amount = { id: 'amount', field: 'amount', aggregate: 'sum', title: '销售额', format: money } as const

// #region links
const links: DashboardLink[] = [
  {
    id: 'byRegion',
    card: 'regions',
    dimension: 'region',
    targets: [{ card: 'months', field: 'region' }, { card: 'orders', field: 'region' }],
  },
  {
    id: 'byMonth',
    card: 'months',
    dimension: 'month',
    targets: [{ card: 'orders', field: 'date' }],
  },
]
// #endregion links

const body: DashboardView = {
  type: 'dashboard',
  grid: { columns: 12, rowHeight: 40 },
  cards: [
    {
      id: 'regions',
      kind: 'chart',
      title: '区域（点选筛选）',
      layout: { x: 0, y: 0, w: 4, h: 7 },
      dataset: 'sales',
      query: { dimensions: [{ id: 'region', field: 'region', title: '区域' }], measures: [amount] },
      chart: { type: 'pie', nameField: 'region', valueField: 'amount', variant: 'donut' },
    },
    {
      id: 'months',
      kind: 'chart',
      title: '月份（点选筛选）',
      layout: { x: 4, y: 0, w: 8, h: 7 },
      dataset: 'sales',
      query: { dimensions: [{ id: 'month', field: 'date', bucket: 'month', title: '月份' }], measures: [amount] },
      chart: { type: 'cartesian', series: [{ id: 'amount', mark: 'bar', x: 'month', y: 'amount' }] },
    },
    {
      id: 'orders',
      kind: 'table',
      title: '订单',
      layout: { x: 0, y: 7, w: 12, h: 7 },
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
        sort: [{ field: 'date' }],
      },
    },
  ],
  links,
}

export const schema: ReportDocument = {
  schemaVersion: 1,
  id: 'linked',
  title: '区域与月份联动',
  datasets: [salesDataset],
  body,
}

export const rows = salesRows
