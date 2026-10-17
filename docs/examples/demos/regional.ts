/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表结构：分组报表带参数栏；计算字段要表达式引擎，参数改了之后下方记下新的取值。

import type { ReportViewerEventMap, XhReportViewer } from '@xihan-report/runtime'
import { defineReportViewer } from '@xihan-report/runtime'
import { createExpressionEngine } from '@xihan-ui/expression'
import { rows, schema } from '../reports/regional.ts'
import '@xihan-ui/styles/index.css'
import '@xihan-report/runtime/style.css'

defineReportViewer()

export function mount(host: HTMLElement): () => void {
  // #region render
  const viewer: XhReportViewer = document.createElement('xh-report-viewer')
  viewer.expressionEngine = createExpressionEngine()
  viewer.dataProvider = async () => ({ kind: 'rows', rows })
  viewer.schema = schema
  // #endregion render

  // #region parameters
  const log = document.createElement('output')
  viewer.addEventListener('parameters-change', (event) => {
    const { value } = (event as ReportViewerEventMap['parameters-change']).detail
    log.textContent = `参数：${JSON.stringify(value)}`
  })
  // #endregion parameters

  host.append(viewer, log)
  return () => host.replaceChildren()
}
