/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 汇总导出计算引擎。

export { aggregateValues, createAccumulator, createRollupAccumulator, isAdditive, NEEDS_ROLLUP } from './aggregate'
export type { Accumulator } from './aggregate'
export type { ComputeEnvironment, ComputeOptions } from './context'
export { buildCrosstab } from './crosstab'
export type { CrosstabHeader, CrosstabResult } from './crosstab'
export { isAggregateMeasure } from './cube'
export { createDateTools } from './date'
export type { DateParts, DateTools } from './date'
export { ReportComputeError } from './errors'
export type { ComputeErrorCode } from './errors'
export { compileFilter, isEmptyOperand, isFilterGroup, resolveOperand } from './filter'
export type { FilterEnvironment, RowPredicate } from './filter'
export { applyCalculatedFields } from './formula'
export type { CompiledFormula, FormulaEngine } from './formula'
export { runQuery } from './query'
export type { QueryResult } from './query'
export { compareByKey, sortBy, sortRows } from './sort'
export type { SortKey } from './sort'
export { buildGroupReport, buildTable } from './table'
export type { GroupNode, GroupReportResult, TableResult } from './table'
export { compareValues, isMissing, valueKey } from './value'
export type { StringCollator } from './value'
