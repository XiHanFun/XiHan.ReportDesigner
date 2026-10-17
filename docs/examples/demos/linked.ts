/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 联动与下钻：点选区域或月份筛选其它卡片；点明细表的格子，下方记下 action 事件带出的取值，宿主据此下钻。

import type { ReportViewerEventMap } from '@xihan-report/runtime'
import { defineReportViewer } from '@xihan-report/runtime'
import { rows, schema } from '../reports/linked.ts'
import '@xihan-ui/styles/index.css'
import '@xihan-report/runtime/style.css'

defineReportViewer()

export function mount(host: HTMLElement): () => void {
  const viewer = document.createElement('xh-report-viewer')
  viewer.dataProvider = async () => ({ kind: 'rows', rows })
  viewer.schema = schema
  const log = document.createElement('output')

  // #region selections
  viewer.addEventListener('selections-change', (event) => {
    const { value } = (event as ReportViewerEventMap['selections-change']).detail
    log.textContent = `联动：${JSON.stringify(value)}`
  })
  // #endregion selections

  // #region action
  viewer.addEventListener('action', (event) => {
    const { card, kind, column, values } = (event as ReportViewerEventMap['action']).detail
    log.textContent = `下钻：卡片 ${card}，${kind} 行，列 ${column}，${JSON.stringify(values)}`
  })
  // #endregion action

  host.append(viewer, log)
  return () => host.replaceChildren()
}
