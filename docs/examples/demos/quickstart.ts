/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 快速开始：把销售明细交给 <xh-report-viewer>，取数回调直接交回内存里的明细行。

// #region setup
import type { ReportDataProvider } from '@xihan-report/runtime'
import { defineReportViewer } from '@xihan-report/runtime'
import { rows, schema } from '../reports/quickstart.ts'
import '@xihan-ui/styles/index.css'
import '@xihan-report/runtime/style.css'

defineReportViewer()
// #endregion setup

export function mount(host: HTMLElement): () => void {
  // #region provider
  const dataProvider: ReportDataProvider = async () => ({ kind: 'rows', rows })
  // #endregion provider

  // #region render
  const viewer = document.createElement('xh-report-viewer')
  viewer.dataProvider = dataProvider
  viewer.schema = schema
  host.append(viewer)
  // #endregion render

  return () => host.replaceChildren()
}
