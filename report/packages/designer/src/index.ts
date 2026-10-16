/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 导出 @xihan-report/designer 的公共接口。

export {
  createReportEditor,
  propertyMergeKey,
  readReportClipboard,
  REPORT_CLIPBOARD_PRODUCT,
  REPORT_CLIPBOARD_VERSION,
  writeReportClipboard,
} from './editor'
export type {
  LayoutGesture,
  ReportAddCardInit,
  ReportClipboard,
  ReportEditor,
  ReportEditorChange,
  ReportEditorOptions,
  ReportItemRef,
  ReportSelection,
  ReportSelectMode,
} from './editor'
