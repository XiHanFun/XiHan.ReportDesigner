/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 聚合查询：按维度分组、计算度量、排序与截取。

import type { DataRow, DatasetData, DatasetSchema, ReportQuery } from '../schema'
import type { ComputeOptions } from './context'
import type { SortKey } from './sort'
import { createEnvironment, prepareInput } from './context'
import { buildCube, isAggregateMeasure, measureFormulas } from './cube'
import { ReportComputeError } from './errors'
import { evaluatePlan, planFormulas } from './formula'
import { sortBy } from './sort'

/** 查询结果。 */
export interface QueryResult {
  /** 每个维度组合一行，以维度 id 与度量 id 为键；已排序、已截取。 */
  readonly rows: readonly DataRow[]
  /** 总计：度量 id 到全部数据（截取之前）上的聚合值。 */
  readonly total: DataRow
}

/**
 * 执行聚合查询。
 * 没有 sort 时按各维度的 sort（缺省按键升序）依次排；limit 在排序之后截取，不影响 total。
 */
export function runQuery(query: ReportQuery, dataset: DatasetSchema, data: DatasetData, options?: ComputeOptions): QueryResult {
  const env = createEnvironment(dataset, options)
  const input = prepareInput(data, query.filter, env)
  const dimensions = query.dimensions
  const plan = planFormulas(env.formula, measureFormulas(query.measures), 'measure')
  const [leaf, all] = buildCube({
    input,
    dimensions,
    measures: query.measures.filter(isAggregateMeasure),
    sets: [dimensions.map((_, i) => i), []],
    dates: env.dates,
    collate: env.collate,
  })

  const rows: DataRow[] = []
  for (const cell of leaf!.cells.values()) {
    evaluatePlan(plan, cell.values, { members: cell.members }, env.formulaScope)
    const row: Record<string, unknown> = {}
    dimensions.forEach((dimension, i) => {
      row[dimension.id] = cell.members[i]
    })
    rows.push(Object.assign(row, cell.values))
  }
  const totalCell = all!.cells.values().next().value!
  evaluatePlan(plan, totalCell.values, { total: true }, env.formulaScope)

  const keys = new Set([...dimensions.map(dimension => dimension.id), ...query.measures.map(measure => measure.id)])
  const sortKeys: SortKey<DataRow>[] = query.sort
    ? query.sort.map((rule) => {
        if (!keys.has(rule.key))
          throw new ReportComputeError('unknown-sort-key', { key: rule.key })
        return { value: row => row[rule.key], direction: rule.direction, nulls: rule.nulls }
      })
    : dimensions.map((dimension) => {
        const by = dimension.sort?.by ?? dimension.id
        if (!keys.has(by))
          throw new ReportComputeError('unknown-sort-key', { key: by })
        return { value: row => row[by], direction: dimension.sort?.direction, nulls: dimension.sort?.nulls }
      })
  const sorted = sortBy(rows, sortKeys, env.collate)
  return {
    rows: query.limit === undefined ? sorted : sorted.slice(0, Math.max(0, query.limit)),
    total: totalCell.values,
  }
}
