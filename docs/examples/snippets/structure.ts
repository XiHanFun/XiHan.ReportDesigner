/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表结构一章的片段：表达式引擎、数据集参数与绑定、筛选树、值格式。

import type { DatasetSchema, FilterGroup, FormatSpec, TableView } from '@xihan-report/core'
// #region engine
import { createExpressionEngine } from '@xihan-ui/expression'

const viewer = document.querySelector('xh-report-viewer')!
viewer.expressionEngine = createExpressionEngine()
// #endregion engine

// #region dataset-parameters
export const stores: DatasetSchema = {
  id: 'sales',
  fields: [
    { name: 'orderId', type: 'string' },
    { name: 'amount', type: 'number' },
  ],
  parameters: [{ name: 'store', type: 'string', required: true }],
}

export const byStore: TableView = {
  type: 'table',
  dataset: 'sales',
  parameters: { store: { parameter: 'store' } },
  columns: [
    { id: 'orderId', field: 'orderId' },
    { id: 'amount', field: 'amount' },
  ],
}
// #endregion dataset-parameters

// #region filter
export const filter: FilterGroup = {
  logic: 'and',
  conditions: [
    { id: 'channel', field: 'channel', operator: 'in', value: ['线上', '门店'] },
    { id: 'big', field: 'amount', operator: 'gte', value: 1000 },
    { id: 'month', field: 'date', bucket: 'month', operator: 'eq', value: '2026-03' },
  ],
}
// #endregion filter

// #region formats
export const money: FormatSpec = { kind: 'number', decimals: 2, grouping: true }
export const share: FormatSpec = { kind: 'percent', decimals: 1 }
export const day: FormatSpec = { kind: 'date', pattern: 'yyyy年M月d日' }
// #endregion formats
