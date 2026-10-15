/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 交叉表（透视）的计算。

import type { CrosstabTotals, CrosstabView, DatasetData, DatasetSchema, Dimension } from '../schema'
import type { ComputeOptions } from './context'
import type { CubeCell, CubeLevel } from './cube'
import type { StringCollator } from './value'
import { createEnvironment, prepareInput } from './context'
import { buildCube, isAggregateMeasure, measureFormulas } from './cube'
import { ReportComputeError } from './errors'
import { evaluatePlan, planFormulas } from './formula'
import { sortBy } from './sort'
import { tupleKey } from './value'

/** 交叉表一条轴上的一项。 */
export interface CrosstabHeader {
  /** member 最内层成员，subtotal 某一层成员的小计，total 总计。 */
  readonly kind: 'member' | 'subtotal' | 'total'
  /** 由外到内各维度的成员：member 写满全部维度，subtotal 写到所在层，total 为空。 */
  readonly keys: readonly unknown[]
}

/** 交叉表的计算结果。 */
export interface CrosstabResult {
  /** 行轴；没有行维度时只有一项 keys 为空的 member。 */
  readonly rows: readonly CrosstabHeader[]
  /** 列轴；没有列维度时只有一项 keys 为空的 member。 */
  readonly columns: readonly CrosstabHeader[]
  /** 度量 id，按视图的次序。 */
  readonly measures: readonly string[]
  /** cells[行][列][度量]：没有任何数据落入的格子各度量为 null。 */
  readonly cells: readonly (readonly (readonly unknown[])[])[]
}

interface AxisEntry extends CrosstabHeader {
  readonly memberKeys: readonly string[]
}

function buildAxis(dimensions: readonly Dimension[], totals: CrosstabTotals | undefined, levelOf: (length: number) => CubeLevel, collate: StringCollator | undefined): AxisEntry[] {
  if (dimensions.length === 0)
    return [{ kind: 'member', keys: [], memberKeys: [] }]
  const depth = dimensions.length
  const byParent = new Map<number, Map<string, CubeCell[]>>()
  for (let length = 1; length <= depth; length++) {
    const map = new Map<string, CubeCell[]>()
    for (const cell of levelOf(length).cells.values()) {
      const parent = tupleKey(cell.memberKeys.slice(0, length - 1))
      const siblings = map.get(parent)
      if (siblings)
        siblings.push(cell)
      else
        map.set(parent, [cell])
    }
    byParent.set(length, map)
  }

  const entries: AxisEntry[] = []
  function walk(length: number, parentKey: string): void {
    const dimension = dimensions[length - 1]!
    const cells = byParent.get(length)!.get(parentKey) ?? []
    const by = dimension.sort?.by
    if (by !== undefined && cells.some(cell => !(by in cell.values)))
      throw new ReportComputeError('unknown-sort-key', { key: by, dimension: dimension.id })
    const sorted = sortBy(cells, [{
      value: cell => (by === undefined ? cell.members[length - 1] : cell.values[by]),
      direction: dimension.sort?.direction,
      nulls: dimension.sort?.nulls,
    }], collate)
    for (const cell of sorted) {
      if (length === depth) {
        entries.push({ kind: 'member', keys: cell.members, memberKeys: cell.memberKeys })
        continue
      }
      walk(length + 1, tupleKey(cell.memberKeys))
      if (totals?.subtotals)
        entries.push({ kind: 'subtotal', keys: cell.members, memberKeys: cell.memberKeys })
    }
  }
  walk(1, tupleKey([]))
  if (totals?.grandTotal !== false)
    entries.push({ kind: 'total', keys: [], memberKeys: [] })
  return entries
}

/**
 * 计算交叉表：行维度与列维度交叉，每格写各度量的聚合值。
 * 每条轴按维度由外到内展开，成员按维度的 sort 排（by 写度量 id 时按该成员在另一条轴总计上的值）；
 * subtotals 在每层成员之后写小计，grandTotal 在轴末写总计。公式度量在每格的聚合值上求值。
 */
export function buildCrosstab(view: CrosstabView, dataset: DatasetSchema, data: DatasetData, options?: ComputeOptions): CrosstabResult {
  const env = createEnvironment(dataset, options)
  const input = prepareInput(data, view.filter, env)
  const rowCount = view.rows.length
  const columnCount = view.columns.length
  const sets: number[][] = []
  for (let r = 0; r <= rowCount; r++) {
    for (let c = 0; c <= columnCount; c++)
      sets.push([...Array.from({ length: r }, (_, i) => i), ...Array.from({ length: c }, (_, i) => rowCount + i)])
  }
  const levels = buildCube({
    input,
    dimensions: [...view.rows, ...view.columns].map(dimension => ({ id: dimension.id, field: dimension.field, bucket: dimension.bucket })),
    measures: view.measures.filter(isAggregateMeasure),
    sets,
    dates: env.dates,
    collate: env.collate,
  })
  const plan = planFormulas(env.formula, measureFormulas(view.measures), 'measure')
  for (const level of levels) {
    for (const cell of level.cells.values())
      evaluatePlan(plan, cell.values, { members: cell.members }, env.formulaScope)
  }

  const levelAt = (r: number, c: number): CubeLevel => levels[r * (columnCount + 1) + c]!
  const rows = buildAxis(view.rows, view.rowTotals, length => levelAt(length, 0), env.collate)
  const columns = buildAxis(view.columns, view.columnTotals, length => levelAt(0, length), env.collate)
  const measures = view.measures.map(measure => measure.id)
  const cells = rows.map(row => columns.map((column) => {
    const cell = levelAt(row.memberKeys.length, column.memberKeys.length).cells.get(tupleKey([...row.memberKeys, ...column.memberKeys]))
    return measures.map(id => (cell ? cell.values[id] : null))
  }))
  return {
    rows: rows.map(({ kind, keys }) => ({ kind, keys })),
    columns: columns.map(({ kind, keys }) => ({ kind, keys })),
    measures,
    cells,
  }
}
