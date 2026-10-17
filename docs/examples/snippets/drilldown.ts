/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 下钻：点汇总表的一格，把这一行的区域交给另一个查看器作参数，打开这个区域的明细。

import type { ReportViewerEventMap, XhReportViewer } from '@xihan-report/runtime'

declare const viewer: XhReportViewer
declare const detailViewer: XhReportViewer

// #region example
viewer.addEventListener('action', (event) => {
  const { values } = (event as ReportViewerEventMap['action']).detail
  if (typeof values.region === 'string')
    detailViewer.parameters = { region: values.region }
})
// #endregion example
