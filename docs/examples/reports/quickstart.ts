/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 快速开始：一张销售明细表，按日期倒序，数量与金额两列出合计。

import type { ReportDocument } from '@xihan-report/core'
import { salesDataset, salesRows } from '../data/sales.ts'

// #region schema
export const schema: ReportDocument = {
  schemaVersion: 1,
  id: 'orders',
  title: '销售明细',
  datasets: [salesDataset],
  body: {
    type: 'table',
    dataset: 'sales',
    columns: [
      { id: 'orderId', field: 'orderId', width: 150 },
      { id: 'date', field: 'date', width: 120 },
      { id: 'region', field: 'region' },
      { id: 'category', field: 'category' },
      { id: 'quantity', field: 'quantity', align: 'end', summary: { aggregate: 'sum' } },
      {
        id: 'amount',
        field: 'amount',
        align: 'end',
        format: { kind: 'number', decimals: 2, grouping: true },
        summary: { aggregate: 'sum' },
      },
    ],
    sort: [{ field: 'date', direction: 'desc' }],
  },
}
// #endregion schema

export const rows = salesRows
