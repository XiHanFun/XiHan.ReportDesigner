/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表结构：按区域、品类两级分组的销售汇总，带区域与起始日期两个参数和一个计算字段。

import type { ReportDocument } from '@xihan-report/core'
import { salesDataset, salesRows } from '../data/sales.ts'

const money = { kind: 'number', decimals: 2, grouping: true } as const

// #region datasets
const sales = {
  ...salesDataset,
  fields: [
    ...salesDataset.fields,
    { name: 'unitPrice', type: 'number', title: '单价', formula: 'amount / quantity' },
  ],
} as const
// #endregion datasets

export const schema: ReportDocument = {
  schemaVersion: 1,
  id: 'regional',
  title: '分区域销售汇总',
  datasets: [sales],
  // #region parameters
  parameters: [
    {
      name: 'region',
      type: 'string',
      title: '区域',
      options: [{ value: '华东' }, { value: '华北' }, { value: '华南' }],
    },
    { name: 'since', type: 'date', title: '起始日期', defaultValue: '2026-04-01' },
  ],
  // #endregion parameters
  // #region body
  body: {
    type: 'group',
    dataset: 'sales',
    groups: [
      { id: 'region', field: 'region', title: '区域', sort: { by: 'amount', direction: 'desc' } },
      { id: 'category', field: 'category', title: '品类' },
    ],
    columns: [
      { id: 'orderId', field: 'orderId', width: 150 },
      { id: 'date', field: 'date', width: 120 },
      { id: 'channel', field: 'channel' },
      { id: 'unitPrice', field: 'unitPrice', align: 'end', format: money },
      { id: 'quantity', field: 'quantity', align: 'end', summary: { aggregate: 'sum' } },
      { id: 'amount', field: 'amount', align: 'end', format: money, summary: { aggregate: 'sum' } },
    ],
    filter: {
      logic: 'and',
      conditions: [
        { id: 'region', field: 'region', operator: 'eq', value: { parameter: 'region' } },
        { id: 'since', field: 'date', operator: 'gte', value: { parameter: 'since' } },
      ],
    },
    sort: [{ field: 'date' }],
  },
  // #endregion body
}

export const rows = salesRows
