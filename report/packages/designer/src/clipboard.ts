/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 剪贴板事件的读写：写入报表自己的 MIME 与 text/plain 两份，读出时先认报表的 MIME，再试 text/plain。

import type { ReportClipboard } from './editor'
import { clipboardMimeType } from '@xihan-ui/designer-kit'
import { readReportClipboard, REPORT_CLIPBOARD_PRODUCT, writeReportClipboard } from './editor'

/** 把卡片写进剪贴板事件的数据。 */
export function writeReportClipboardData(data: DataTransfer, clipboard: ReportClipboard): void {
  const text = writeReportClipboard(clipboard)
  data.setData(clipboardMimeType(REPORT_CLIPBOARD_PRODUCT), text)
  data.setData('text/plain', text)
}

/** 从剪贴板事件的数据读出卡片；不是报表的剪贴板时为 undefined。 */
export function readReportClipboardData(data: DataTransfer): ReportClipboard | undefined {
  const own = data.getData(clipboardMimeType(REPORT_CLIPBOARD_PRODUCT))
  return (own ? readReportClipboard(own) : undefined) ?? readReportClipboard(data.getData('text/plain'))
}
