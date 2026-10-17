/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 导出 @xihan-report/core 的公共接口。

export { planFillBindings } from './binding-plans'
export type { FillBindingsOptions } from './binding-plans'
export { bodyQuery, cardDataset, cardQuery, cardView, isDataView } from './card-data'
export type { QueryBinding } from './card-data'
export { cardTemplate, cardTypeOf, REPORT_CARD_TYPES } from './card-templates'
export type { CardTemplate, ReportCardType } from './card-templates'
export { datasetUsage, planRemoveDataset, planRemoveField, planRemoveParameter, planRenameParameter } from './data-plans'
export type { DataCascade, DataRemoval } from './data-plans'
export * from './engine'
export type { CompiledExpression, EngineCompileOptions, EngineCompileResult, EngineEvaluation, ExpressionEngine, ExpressionIssue } from './expression'
export { createReportModel, REPORT_CORE_EXTENSION, REPORT_CORE_EXTENSION_ID, REPORT_EXTENSION_SPACES } from './extensions'
export type { MetricValue, ReportCardData, ReportCardKind, ReportCoreExtension, ReportKindCheck, ReportKindEntry, ReportKindInput, ReportModel, ReportPropertyTarget, ReportQueryIds, ReportRuleContext, ReportViewData, ReportViewKind } from './extensions'
export { gridItems, layoutOperations, planAddCard, planCardLayout, planCompactLayout, planRemoveCard } from './grid'
export type { CardPlacement, NewCard, NewExtensionCard } from './grid'
export { planAddFieldItem, planRemoveItem, planRenameField, planRenameItem } from './item-plans'
export * from './operations'
export * from './properties'
export * from './schema'
export * from './validate'
