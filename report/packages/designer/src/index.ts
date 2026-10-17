/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// @xihan-report/designer —— 报表设计器 <xh-report-designer>。导入不注册元素，调用 defineReportDesigner() 才注册。

export type { ReportAddCardInit, ReportAddExtensionCardInit, ReportClipboard, ReportDataRef, ReportItemRef, ReportSelection } from './editor'
export { readReportClipboard, REPORT_CLIPBOARD_PRODUCT, REPORT_CLIPBOARD_VERSION, writeReportClipboard } from './editor'
export type {
  ReportCardTemplate,
  ReportDesignerCommand,
  ReportDesignerContext,
  ReportDesignerExtension,
  ReportDesignerModel,
  ReportMenuSubject,
  ReportPaletteGroup,
  ReportPaletteItem,
  ReportPropertyEditor,
} from './extensions'
export { createReportDesignerModel, REPORT_DESIGNER_EXTENSION, REPORT_MENU_LAYOUT, REPORT_TOOLBAR_LAYOUT } from './extensions'
export { defineReportDesigner, REPORT_DESIGNER_PANELS, REPORT_DESIGNER_TAG, XhReportDesigner } from './report-designer'
export type { ReportDatasetEditing, ReportDesignerEventMap, ReportDesignerMode, ReportDesignerPanel, ReportSchemaChangeKind } from './report-designer'
