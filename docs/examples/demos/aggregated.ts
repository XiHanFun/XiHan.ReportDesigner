/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 与宿主集成：模拟一个按请求聚合的后端。带 query 的请求交回已聚合的行与汇总行，别的交回明细行；
// 下方列出查看器发出的每个请求。

import type { DatasetData, DatasetRequest, DatasetRollup } from '@xihan-report/core'
import type { ReportDataProvider } from '@xihan-report/runtime'
import { runQuery } from '@xihan-report/core'
import { defineReportViewer } from '@xihan-report/runtime'
import { createExpressionEngine } from '@xihan-ui/expression'
import { salesDataset } from '../data/sales.ts'
import { rows, schema } from '../reports/dashboard.ts'
import '@xihan-ui/styles/index.css'
import '@xihan-report/runtime/style.css'

defineReportViewer()

// #region aggregate
/** 在「服务端」按请求聚合：每组一行，另给出 rollups 列出的各组汇总。 */
function aggregate(request: DatasetRequest): DatasetData {
  const query = request.query!
  const run = (ids: readonly string[]): ReturnType<typeof runQuery> => runQuery(
    { dimensions: query.dimensions.filter(item => ids.includes(item.id)), measures: query.measures, filter: request.filter ?? undefined },
    salesDataset,
    { kind: 'rows', rows },
    { timeZone: 'Asia/Shanghai' },
  )
  const leaf = run(query.dimensions.map(item => item.id))
  const rollups: DatasetRollup[] = query.rollups.flatMap(ids => (ids.length === 0
    ? [{ dimensions: [], row: leaf.total }]
    : run(ids).rows.map(row => ({ dimensions: ids, row }))))
  return { kind: 'aggregated', rows: leaf.rows, rollups }
}
// #endregion aggregate

export function mount(host: HTMLElement): () => void {
  const log = document.createElement('output')
  const seen: string[] = []

  // #region provider
  const dataProvider: ReportDataProvider = async (request) => {
    seen.push(`${request.dataset} ${request.query ? `聚合 ${request.query.dimensions.map(item => item.id).join('、') || '（总计）'}` : `明细 limit=${request.limit}`}`)
    log.textContent = seen.join('\n')
    return request.query ? aggregate(request) : { kind: 'rows', rows }
  }
  // #endregion provider

  const viewer = document.createElement('xh-report-viewer')
  viewer.expressionEngine = createExpressionEngine()
  viewer.dataProvider = dataProvider
  viewer.schema = schema
  host.append(viewer, log)
  return () => host.replaceChildren()
}
