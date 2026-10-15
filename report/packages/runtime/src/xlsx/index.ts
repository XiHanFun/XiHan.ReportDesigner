/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 导出 @xihan-report/runtime/xlsx：零依赖的 xlsx 写出与报表导出。

export { XlsxError } from './errors'
export type { XlsxErrorCode } from './errors'
export { dateFormatCode, excelSerial, numberFormatCode } from './format'
export { crosstabSheet, groupSheet, tableSheet } from './report'
export type { SheetOptions, XlsxTranslations } from './report'
export { sheetName, writeXlsx, XLSX_MIME, xlsxBlob } from './workbook'
export type { XlsxCell, XlsxFrozen, XlsxMerge, XlsxRow, XlsxSheet, XlsxWorkbook, XlsxWriteOptions } from './workbook'
export type { ZipCompression } from './zip'
