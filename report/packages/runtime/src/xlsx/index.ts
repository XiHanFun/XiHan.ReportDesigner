/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 导出 @xihan-report/runtime/xlsx：把报表排成 @xihan-ui/xlsx 的工作表，写出交给 @xihan-ui/xlsx。

export { crosstabSheet, groupSheet, tableSheet } from './report'
export type { SheetOptions, XlsxTranslations } from './report'
