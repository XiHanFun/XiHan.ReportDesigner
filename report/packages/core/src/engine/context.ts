/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 计算选项与计算环境：参数、时区、字符串比较、公式引擎与追加筛选。

import type { DataRow, DatasetData, DatasetRollup, DatasetSchema, FieldType, FilterCondition, FilterGroup, ParameterValues } from '../schema'
import type { DateTools } from './date'
import type { FilterEnvironment } from './filter'
import type { FormulaEngine } from './formula'
import type { StringCollator } from './value'
import { createDateTools } from './date'
import { ReportComputeError } from './errors'
import { compileFilter } from './filter'
import { applyCalculatedFields } from './formula'

/** 计算选项。 */
export interface ComputeOptions {
  /** 报表参数的取值，筛选条件里的参数引用从这里取。 */
  readonly parameters?: ParameterValues
  /** 表达式引擎：数据集有计算字段或视图有公式时必须提供。 */
  readonly formula?: FormulaEngine
  /** 日期粒度与日期比较所在的时区（IANA 名），缺省 UTC。 */
  readonly timeZone?: string
  /** 字符串比较，缺省按 UTF-16 码元。 */
  readonly collate?: StringCollator
  /** 追加的筛选条件（如看板联动），与视图的筛选同时满足。 */
  readonly filters?: readonly FilterCondition[]
}

/** 一次计算的环境。 */
export interface ComputeEnvironment extends FilterEnvironment {
  readonly dataset: DatasetSchema
  readonly dates: DateTools
  readonly formula: FormulaEngine | undefined
  readonly filters: readonly FilterCondition[]
}

/** 准备好参与计算的数据。 */
export interface PreparedInput {
  readonly rows: readonly DataRow[]
  /** rows 是否为已聚合行。 */
  readonly aggregated: boolean
  readonly rollups: readonly DatasetRollup[]
}

/** 建一次计算的环境。 */
export function createEnvironment(dataset: DatasetSchema, options: ComputeOptions = {}): ComputeEnvironment {
  const types = new Map<string, FieldType>()
  for (const field of dataset.fields)
    types.set(field.name, field.type)
  return {
    dataset,
    parameters: options.parameters ?? {},
    dates: createDateTools(options.timeZone),
    fieldType: field => types.get(field),
    collate: options.collate,
    formula: options.formula,
    filters: options.filters ?? [],
  }
}

/**
 * 准备数据：明细行先算出计算字段再筛选；已聚合数据视为已按请求筛选过，原样使用。
 * requireRows 为真时不接受已聚合数据。
 */
export function prepareInput(data: DatasetData, filter: FilterGroup | undefined, env: ComputeEnvironment, requireRows = false): PreparedInput {
  if (data.kind === 'aggregated') {
    if (requireRows)
      throw new ReportComputeError('aggregated-input-unsupported', { dataset: env.dataset.id })
    return { rows: data.rows, aggregated: true, rollups: data.rollups ?? [] }
  }
  const rows = applyCalculatedFields(data.rows, env.dataset, env.formula)
  const predicate = compileFilter(filter, env.filters, env)
  return { rows: rows.filter(row => predicate(row)), aggregated: false, rollups: [] }
}
