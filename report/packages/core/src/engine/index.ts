/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 汇总导出计算引擎。

export { createRollupAccumulator, isAdditive, NEEDS_ROLLUP } from './aggregate'
export type { ComputeEnvironment, ComputeOptions } from './context'
export { buildCrosstab } from './crosstab'
export type { CrosstabHeader, CrosstabResult } from './crosstab'
export { isAggregateMeasure } from './cube'
export { cardDimension, computeMetric, findCard, resolveLinkFilters } from './dashboard'
export type { CardDimension, LinkSelections, MetricResult } from './dashboard'
export { createDateTools } from './date'
export type { DateParts, DateTools } from './date'
export { ReportComputeError } from './errors'
export type { ComputeErrorCode } from './errors'
export { compileFilter, isEmptyOperand, isFilterGroup, resolveOperand } from './filter'
export type { FilterEnvironment, RowPredicate } from './filter'
export { applyCalculatedFields } from './formula'
export { resolveParameters } from './parameters'
export type { ParameterIssueCode, ResolvedParameters } from './parameters'
export { runQuery } from './query'
export type { QueryResult } from './query'
export { createDatasetRequest, findDataset } from './request'
export type { RequestOptions, RequestSource } from './request'
export { sortRows } from './sort'
export { buildGroupReport, buildTable } from './table'
export type { GroupNode, GroupReportResult, TableResult } from './table'
