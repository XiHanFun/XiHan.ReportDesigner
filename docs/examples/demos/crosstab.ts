/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 透视与交叉表：区域与季度交叉表；平均单价是公式度量，要表达式引擎。

import { defineReportViewer } from '@xihan-report/runtime'
import { createExpressionEngine } from '@xihan-ui/expression'
import { rows, schema } from '../reports/crosstab.ts'
import '@xihan-ui/styles/index.css'
import '@xihan-report/runtime/style.css'

defineReportViewer()

export function mount(host: HTMLElement): () => void {
  const viewer = document.createElement('xh-report-viewer')
  viewer.expressionEngine = createExpressionEngine()
  viewer.dataProvider = async () => ({ kind: 'rows', rows })
  viewer.schema = schema
  host.append(viewer)
  return () => host.replaceChildren()
}
