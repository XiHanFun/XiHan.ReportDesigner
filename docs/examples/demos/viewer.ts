/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 查看器：宿主自己管参数（受控），隐藏参数栏；按钮切换区域、重新取数，下方记下取数状态与 getResults() 的结果。

import type { ReportViewerEventMap } from '@xihan-report/runtime'
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
  const log = document.createElement('output')

  // #region controlled
  viewer.hideParameters = true
  viewer.parameters = { region: '华东' }

  const regions = ['华东', '华北', '华南'].map((region) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = region
    button.addEventListener('click', () => {
      viewer.parameters = { ...viewer.parameters, region }
    })
    return button
  })
  // #endregion controlled

  // #region refresh
  const refresh = document.createElement('button')
  refresh.type = 'button'
  refresh.textContent = '重新取数'
  refresh.addEventListener('click', () => void viewer.refresh())

  viewer.addEventListener('loading-change', (event) => {
    const { loading } = (event as ReportViewerEventMap['loading-change']).detail
    if (loading)
      return
    const { body, parameters } = viewer.getResults()
    const count = body && 'type' in body && body.type === 'group' ? body.result.count : 0
    log.textContent = `参数 ${JSON.stringify(parameters)}，筛选后 ${count} 笔订单`
  })
  // #endregion refresh

  host.append(...regions, refresh, viewer, log)
  return () => host.replaceChildren()
}
