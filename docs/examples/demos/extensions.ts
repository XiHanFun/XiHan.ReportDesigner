/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 扩展：查看器装上 @acme/goal 的运行时层。达成目标的卡片外面垫一圈描边；下方记下每次取数的耗时，
// 点「导出 CSV」把导出器写出的文字显示出来。

import { defineReportViewer } from '@xihan-report/runtime'
import { createGoalRuntime } from '../extensions/goal-runtime.ts'
import { rows, schema } from '../reports/goals.ts'
import '@xihan-ui/styles/index.css'
import '@xihan-report/runtime/style.css'

defineReportViewer()

export function mount(host: HTMLElement): () => void {
  const fetches = document.createElement('output')
  const csv = document.createElement('output')

  // #region install
  const goal = createGoalRuntime((record) => {
    fetches.textContent = `取数 ${record.dataset}：${record.milliseconds} ms`
  })
  const viewer = document.createElement('xh-report-viewer')
  viewer.extensions = [goal]
  viewer.dataProvider = async () => ({ kind: 'rows', rows })
  viewer.schema = schema
  // #endregion install

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = '导出 CSV'
  button.addEventListener('click', async () => {
    csv.textContent = String(await viewer.export('csv'))
  })

  host.append(button, viewer, fetches, csv)
  return () => host.replaceChildren()
}
