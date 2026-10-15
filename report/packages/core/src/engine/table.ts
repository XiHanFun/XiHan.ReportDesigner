/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 明细表与分组报表的计算。

import type { DataRow, DatasetData, DatasetSchema, GroupView, TableColumn, TableView } from '../schema'
import type { ComputeOptions } from './context'
import type { CubeCell, CubeMeasure } from './cube'
import type { FormulaEntry } from './formula'
import { sortBy, tupleKey } from '@xihan-ui/viz'
import { createEnvironment, prepareInput } from './context'
import { buildCube } from './cube'
import { ReportComputeError } from './errors'
import { evaluatePlan, planFormulas } from './formula'
import { sortRows } from './sort'

/** 明细表的计算结果。 */
export interface TableResult {
  /** 筛选、排序、截取之后的行。 */
  readonly rows: readonly DataRow[]
  /** 合计：带汇总的列 id 到全部筛选结果（截取之前）上的汇总值；没有列带汇总时为 null。 */
  readonly summary: DataRow | null
  /** 筛选之后、截取之前的行数。 */
  readonly count: number
}

/** 分组报表里的一个组。 */
export interface GroupNode {
  /** 分组 id。 */
  readonly group: string
  /** 第几级分组，0 起。 */
  readonly level: number
  /** 组的键：字段值，写了日期粒度时是粒度键；缺失值为 null。 */
  readonly key: unknown
  /** 组小计：带汇总的列 id 到组内的汇总值。 */
  readonly summary: DataRow
  /** 组内的行数。 */
  readonly count: number
  /** 下一级分组；最后一级为空。 */
  readonly children: readonly GroupNode[]
  /** 组内的明细行：只有最后一级且列出明细时才有。 */
  readonly rows: readonly DataRow[]
}

/** 分组报表的计算结果。 */
export interface GroupReportResult {
  readonly groups: readonly GroupNode[]
  /** 总计：带汇总的列 id 到全部数据上的汇总值；不写总计时为 null。 */
  readonly total: DataRow | null
  /** 筛选之后的行数。 */
  readonly count: number
}

function summaryMeasures(columns: readonly TableColumn[]): CubeMeasure[] {
  const measures: CubeMeasure[] = []
  for (const column of columns) {
    if (column.summary && 'aggregate' in column.summary)
      measures.push({ id: column.id, aggregate: column.summary.aggregate, field: column.field })
  }
  return measures
}

function summaryFormulas(columns: readonly TableColumn[]): FormulaEntry[] {
  const entries: FormulaEntry[] = []
  for (const column of columns) {
    if (column.summary && 'formula' in column.summary)
      entries.push({ name: column.id, expression: column.summary.formula })
  }
  return entries
}

/**
 * 计算明细表：算出计算字段、筛选、排序、汇总，再截取。不接受已聚合数据。
 * 汇总公式以其它列的汇总值为变量。
 */
export function buildTable(view: TableView, dataset: DatasetSchema, data: DatasetData, options?: ComputeOptions): TableResult {
  const env = createEnvironment(dataset, options)
  const input = prepareInput(data, view.filter, env, true)
  const rows = view.sort ? sortRows(input.rows, view.sort, env) : input.rows
  const measures = summaryMeasures(view.columns)
  const formulas = summaryFormulas(view.columns)
  let summary: DataRow | null = null
  if (measures.length > 0 || formulas.length > 0) {
    const plan = planFormulas(env.formula, formulas, 'column')
    const [total] = buildCube({ input, dimensions: [], measures, sets: [[]], dates: env.dates, collate: env.collate })
    const values = total!.cells.get(tupleKey([]))!.values
    evaluatePlan(plan, values, { total: true }, env.formulaScope)
    summary = values
  }
  return {
    rows: view.limit === undefined ? rows : rows.slice(0, Math.max(0, view.limit)),
    summary,
    count: rows.length,
  }
}

/**
 * 计算分组报表：逐级分组，每组算出带汇总的列的小计。
 * 组按分组的 sort 排（by 写带汇总的列 id 时按该列的组小计，缺省按键升序），组内明细按视图的 sort 排。
 * 列出明细时不接受已聚合数据；不列明细时已聚合行以分组 id 与列 id 为键。
 */
export function buildGroupReport(view: GroupView, dataset: DatasetSchema, data: DatasetData, options?: ComputeOptions): GroupReportResult {
  const detail = view.detail !== false
  const env = createEnvironment(dataset, options)
  const prepared = prepareInput(data, view.filter, env, detail)
  const input = detail && view.sort ? { ...prepared, rows: sortRows(prepared.rows, view.sort, env) } : prepared
  const groups = view.groups
  const depth = groups.length
  const plan = planFormulas(env.formula, summaryFormulas(view.columns), 'column')
  const levels = buildCube({
    input,
    dimensions: groups.map(group => ({ id: group.id, field: group.field, bucket: group.bucket })),
    measures: summaryMeasures(view.columns),
    sets: Array.from({ length: depth + 1 }, (_, k) => Array.from({ length: k }, (_, i) => i)),
    collect: detail ? depth : undefined,
    dates: env.dates,
    collate: env.collate,
  })
  for (const level of levels) {
    for (const cell of level.cells.values())
      evaluatePlan(plan, cell.values, { members: cell.members }, env.formulaScope)
  }

  const byParent = levels.map((level, k) => {
    const map = new Map<string, CubeCell[]>()
    for (const cell of level.cells.values()) {
      const parent = tupleKey(cell.memberKeys.slice(0, Math.max(0, k - 1)))
      const siblings = map.get(parent)
      if (siblings)
        siblings.push(cell)
      else
        map.set(parent, [cell])
    }
    return map
  })

  function children(level: number, parentKey: string): GroupNode[] {
    const group = groups[level]!
    const cells = byParent[level + 1]!.get(parentKey) ?? []
    const by = group.sort?.by
    if (by !== undefined && cells.some(cell => !(by in cell.values)))
      throw new ReportComputeError('unknown-sort-key', { key: by, group: group.id })
    const sorted = sortBy(cells, [{
      value: cell => (by === undefined ? cell.members[level] : cell.values[by]),
      direction: group.sort?.direction,
      nulls: group.sort?.nulls,
    }], env)
    return sorted.map(cell => ({
      group: group.id,
      level,
      key: cell.members[level],
      summary: cell.values,
      count: cell.count,
      children: level + 1 < depth ? children(level + 1, tupleKey(cell.memberKeys)) : [],
      rows: level + 1 === depth && detail ? cell.rows : [],
    }))
  }

  const root = levels[0]!.cells.get(tupleKey([]))!
  return {
    groups: depth === 0 ? [] : children(0, tupleKey([])),
    total: view.grandTotal === false ? null : root.values,
    count: root.count,
  }
}
