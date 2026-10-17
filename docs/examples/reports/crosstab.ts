/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 透视与交叉表：区域、品类在行上，季度在列上，格子里是销售额、销量与按两者算出的平均单价。

import type { ReportDocument } from '@xihan-report/core'
import { salesDataset, salesRows } from '../data/sales.ts'

const money = { kind: 'number', decimals: 2, grouping: true } as const

export const schema: ReportDocument = {
  schemaVersion: 1,
  id: 'pivot',
  title: '区域与季度交叉表',
  datasets: [salesDataset],
  // #region body
  body: {
    type: 'crosstab',
    dataset: 'sales',
    rows: [
      { id: 'region', field: 'region', title: '区域', sort: { by: 'amount', direction: 'desc' } },
      { id: 'category', field: 'category', title: '品类' },
    ],
    columns: [{ id: 'quarter', field: 'date', bucket: 'quarter', title: '季度' }],
    measures: [
      { id: 'amount', field: 'amount', aggregate: 'sum', title: '销售额', format: money },
      { id: 'quantity', field: 'quantity', aggregate: 'sum', title: '销量' },
      { id: 'price', formula: 'amount / quantity', title: '平均单价', format: money },
    ],
    rowTotals: { subtotals: true },
  },
  // #endregion body
}

export const rows = salesRows
