/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 取回的数据按视图类型交给 core 计算。

import type { ComputeOptions, CrosstabResult, CrosstabView, DatasetData, DatasetSchema, DataView, GroupReportResult, GroupView, TableResult, TableView } from '@xihan-report/core'
import { buildCrosstab, buildGroupReport, buildTable } from '@xihan-report/core'

/** 一个数据视图的计算结果。 */
export type ViewResult
  = | { readonly type: 'table', readonly view: TableView, readonly dataset: DatasetSchema, readonly result: TableResult }
    | { readonly type: 'group', readonly view: GroupView, readonly dataset: DatasetSchema, readonly result: GroupReportResult }
    | { readonly type: 'crosstab', readonly view: CrosstabView, readonly dataset: DatasetSchema, readonly result: CrosstabResult }

/** 按视图类型计算。 */
export function computeView(view: DataView, dataset: DatasetSchema, data: DatasetData, options: ComputeOptions): ViewResult {
  switch (view.type) {
    case 'table':
      return { type: 'table', view, dataset, result: buildTable(view, dataset, data, options) }
    case 'group':
      return { type: 'group', view, dataset, result: buildGroupReport(view, dataset, data, options) }
    case 'crosstab':
      return { type: 'crosstab', view, dataset, result: buildCrosstab(view, dataset, data, options) }
  }
}
