/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 自己组织工作簿：把几个查看器此刻的结果各排成一张表，写进同一个工作簿。

import type { ViewResult } from '@xihan-report/core'
import type { XhReportViewer } from '@xihan-report/runtime'
import type { XlsxSheet } from '@xihan-ui/xlsx'

// #region example
import { crosstabSheet, groupSheet, tableSheet } from '@xihan-report/runtime/xlsx'
import { writeXlsx, xlsxBlob } from '@xihan-ui/xlsx'

function sheetOf(view: ViewResult, name: string): XlsxSheet {
  const options = { dataset: view.dataset, name, timeZone: 'Asia/Shanghai' }
  if (view.type === 'table')
    return tableSheet(view.view, view.result, options)
  if (view.type === 'group')
    return groupSheet(view.view, view.result, options)
  return crosstabSheet(view.view, view.result, options)
}

/** 每项是一个查看器与它那张表的表名。 */
export async function exportWorkbook(entries: readonly (readonly [XhReportViewer, string])[]): Promise<Blob> {
  const sheets: XlsxSheet[] = []
  for (const [viewer, name] of entries) {
    const body = viewer.getResults().body
    if (body && 'type' in body)
      sheets.push(sheetOf(body, name))
  }
  return xlsxBlob(await writeXlsx({ sheets }))
}
// #endregion example
