/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 导出：把分组报表此刻的计算结果写成 Excel 工作簿，点按钮下载。

import { defineReportViewer } from '@xihan-report/runtime'
import { createExpressionEngine } from '@xihan-ui/expression'
import { rows, schema } from '../reports/regional.ts'
import '@xihan-ui/styles/index.css'
import '@xihan-report/runtime/style.css'

defineReportViewer()

export function mount(host: HTMLElement): () => void {
  const viewer = document.createElement('xh-report-viewer')
  viewer.expressionEngine = createExpressionEngine()
  viewer.dataProvider = async () => ({ kind: 'rows', rows })
  viewer.schema = schema

  // #region export
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = '导出 Excel'
  button.addEventListener('click', async () => {
    const blob = await viewer.export('xlsx', { name: '销售汇总' }) as Blob
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = '分区域销售汇总.xlsx'
    link.click()
    URL.revokeObjectURL(link.href)
  })
  // #endregion export

  host.append(button, viewer)
  return () => host.replaceChildren()
}
