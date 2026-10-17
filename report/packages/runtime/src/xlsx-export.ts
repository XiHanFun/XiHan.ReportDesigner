/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 内置的 xlsx 导出：表格主体导出一张表，看板按已算好的表格卡片各导一张（表名取卡片标题）。由导出器按需加载。

import type { ViewResult } from '@xihan-report/core'
import type { XlsxSheet } from '@xihan-ui/xlsx'
import type { ReportExportContext } from './extensions'
import { sheetName, writeXlsx, xlsxBlob } from '@xihan-ui/xlsx'
import { crosstabSheet, groupSheet, tableSheet } from './xlsx/index'

/** 把计算结果写成 xlsx；还没有可导出的表格时抛 RangeError。options.name 是表格主体那张表的名字。 */
export async function exportResultsXlsx(context: ReportExportContext): Promise<Blob> {
  const { results, schema, translations } = context
  const base = { timeZone: context.timeZone, translations: { total: translations.total, subtotal: translations.subtotal } }
  const sheet = (view: ViewResult, name: string): XlsxSheet => {
    const options = { ...base, dataset: view.dataset, name }
    if (view.type === 'table')
      return tableSheet(view.view, view.result, options)
    if (view.type === 'group')
      return groupSheet(view.view, view.result, options)
    return crosstabSheet(view.view, view.result, options)
  }
  const sheets: XlsxSheet[] = []
  if (schema.body.type === 'dashboard') {
    const used = new Set<string>()
    for (const { result } of results.cards) {
      if (result.card.kind !== 'table')
        continue
      const title = result.card.title ?? result.card.id
      let name = sheetName(title)
      for (let index = 2; used.has(name.toLowerCase()); index++)
        name = sheetName(`${title.slice(0, 26)} (${index})`)
      used.add(name.toLowerCase())
      sheets.push(sheet(result.value as ViewResult, name))
    }
  }
  else if (results.body && 'type' in results.body) {
    const name = typeof context.options.name === 'string' ? context.options.name : schema.title ?? schema.id
    sheets.push(sheet(results.body, name))
  }
  if (sheets.length === 0)
    throw new RangeError('[xh-report-viewer] there is no computed table to export')
  return xlsxBlob(await writeXlsx({ sheets }))
}
