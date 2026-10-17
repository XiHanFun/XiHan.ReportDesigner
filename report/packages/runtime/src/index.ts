/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// @xihan-report/runtime —— 业务页面用的报表查看器 <xh-report-viewer>。导入不注册元素，调用 defineReportViewer() 才注册。

export { DEFAULT_REPORT_DESIGNER_TRANSLATIONS } from './designer-translations'
export type { ReportDesignerCascade, ReportDesignerIssueDetails, ReportDesignerTranslations } from './designer-translations'
export { createReportRuntimeModel, REPORT_RUNTIME_EXTENSION, REPORT_RUNTIME_EXTENSION_ID } from './extensions'
export type { ReportCardRenderer, ReportDataMiddleware, ReportExportContext, ReportRendered, ReportResults, ReportRuntimeExtension, ReportRuntimeModel, ReportViewRenderer } from './extensions'
export { DEFAULT_REPORT_VIEWER_TRANSLATIONS } from './translations'
export type { ReportViewerTranslations } from './translations'
export type { RenderedChart } from './viewer/charts'
export type { RenderContext } from './viewer/context'
export { defaultFormatter } from './viewer/format'
export type { ReportFormatContext, ReportFormatter } from './viewer/format'
export { defineReportViewer, REPORT_VIEWER_TAG, XhReportViewer } from './viewer/report-viewer'
export type { ReportDataContext, ReportDataProvider, ReportViewerEventMap, ReportViewerIssue } from './viewer/report-viewer'
export type { RenderedTable, TableCellRef } from './viewer/table'
