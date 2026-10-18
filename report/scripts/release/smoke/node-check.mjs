/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 冒烟的 Node 侧：core 不碰 DOM，在 Node 里校验一份报表定义并算出明细表，没有 error 级问题、合计对得上即通过。
import { computeView, validateDocument } from '@xihan-report/core'

const dataset = { id: 'sales', fields: [{ name: 'region', type: 'string' }, { name: 'amount', type: 'number' }] }
const body = {
  type: 'table',
  dataset: 'sales',
  columns: [
    { id: 'region', field: 'region' },
    { id: 'amount', field: 'amount', align: 'end', summary: { aggregate: 'sum' } },
  ],
}
const errors = validateDocument({ schemaVersion: 1, id: 'smoke', datasets: [dataset], body }).filter(issue => issue.severity === 'error')
if (errors.length > 0) {
  console.error('[smoke] ✗ Node 里建的报表定义校验不通过：', errors)
  process.exit(1)
}
const view = computeView(body, dataset, { kind: 'rows', rows: [{ region: '华东', amount: 10 }, { region: '华北', amount: 5 }] })
if (view.type !== 'table' || view.result.count !== 2 || view.result.summary?.amount !== 15) {
  console.error('[smoke] ✗ Node 里算出的明细表不对：', view)
  process.exit(1)
}
console.log('[smoke] Node 侧：@xihan-report/core 导入、校验报表定义与计算明细表正常')
