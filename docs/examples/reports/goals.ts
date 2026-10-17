/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 扩展：用示例扩展 @acme/goal 的目标进度卡片做的看板。上半年的销售额已达成，线上渠道还差一截。

import type { DashboardCard, ReportDocument } from '@xihan-report/core'
import { salesDataset, salesRows } from '../data/sales.ts'
import { goalCore } from '../extensions/goal-core.ts'

const amount = { id: 'amount', field: 'amount', aggregate: 'sum', title: '销售额' } as const

// #region cards
const cards: DashboardCard[] = [
  {
    id: 'half',
    kind: 'goal.progress',
    title: '上半年销售额',
    layout: { x: 0, y: 0, w: 6, h: 3 },
    dataset: 'sales',
    query: { dimensions: [], measures: [amount] },
    value: 'amount',
    target: 200000,
  },
  {
    id: 'online',
    kind: 'goal.progress',
    title: '线上渠道销售额',
    layout: { x: 6, y: 0, w: 6, h: 3 },
    dataset: 'sales',
    query: {
      dimensions: [],
      measures: [amount],
      filter: { logic: 'and', conditions: [{ id: 'online', field: 'channel', operator: 'eq', value: '线上' }] },
    },
    value: 'amount',
    target: 150000,
  },
]
// #endregion cards

export const schema: ReportDocument = {
  schemaVersion: 1,
  id: 'goals',
  title: '目标达成',
  datasets: [salesDataset],
  body: { type: 'dashboard', grid: { columns: 12, rowHeight: 40 }, cards },
}

export const rows = salesRows

/** 这份报表用到的扩展：check:examples 校验与计算时带上。 */
export const extensions = [goalCore]
