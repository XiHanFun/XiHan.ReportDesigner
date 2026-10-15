/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 多分组集的一遍聚合：每行按每个分组集取键，累加进对应的格子。

import type { ExpressionEntry } from '@xihan-ui/expression'
import type { Accumulator, StringCollator } from '@xihan-ui/viz'
import type { AggregateKind, AggregateMeasure, DataRow, DateBucket, FormulaMeasure, Measure } from '../schema'
import type { PreparedInput } from './context'
import type { DateTools } from './date'
import { createAccumulator, isMissing, tupleKey, valueKey } from '@xihan-ui/viz'
import { createRollupAccumulator, NEEDS_ROLLUP } from './aggregate'

/** 参与聚合的维度。 */
export interface CubeDimension {
  readonly id: string
  readonly field: string
  readonly bucket?: DateBucket
}

/** 参与聚合的度量。 */
export interface CubeMeasure {
  readonly id: string
  readonly aggregate: AggregateKind
  readonly field?: string
}

/** 一个格子：一个分组集上的一个维度组合。 */
export interface CubeCell {
  /** 分组集各维度的取值。 */
  readonly members: readonly unknown[]
  /** 分组集各维度取值的身份编码。 */
  readonly memberKeys: readonly string[]
  /** 度量 id 到聚合值；公式度量由调用方写入。 */
  readonly values: Record<string, unknown>
  /** 聚合进来的行数。 */
  readonly count: number
  /** 聚合进来的行；只有 collect 指定的分组集收集。 */
  readonly rows: readonly DataRow[]
}

/** 一个分组集的全部格子。 */
export interface CubeLevel {
  /** 分组集：维度下标，升序。 */
  readonly dimensions: readonly number[]
  /** 格子身份（成员编码的 tupleKey）到格子。 */
  readonly cells: ReadonlyMap<string, CubeCell>
}

/** buildCube 的输入。 */
export interface CubeInput {
  readonly input: PreparedInput
  readonly dimensions: readonly CubeDimension[]
  readonly measures: readonly CubeMeasure[]
  /** 分组集，各自是维度下标的升序数组。 */
  readonly sets: readonly (readonly number[])[]
  /** 收集明细行的分组集下标。 */
  readonly collect?: number
  readonly dates: DateTools
  readonly collate?: StringCollator
}

interface CellBuilder {
  readonly members: unknown[]
  readonly memberKeys: string[]
  readonly accumulators: Accumulator[]
  count: number
  readonly rows: DataRow[]
}

/** 度量是否为聚合度量。 */
export function isAggregateMeasure(measure: Measure): measure is AggregateMeasure {
  return 'aggregate' in measure
}

/** 公式度量的求值项。 */
export function measureFormulas(measures: readonly Measure[]): ExpressionEntry[] {
  return measures
    .filter((measure): measure is FormulaMeasure => !isAggregateMeasure(measure))
    .map(measure => ({ name: measure.id, expression: measure.formula }))
}

function rollupIndex(cube: CubeInput): Map<string, Map<string, DataRow>> {
  const index = new Map<string, Map<string, DataRow>>()
  const positions = new Map(cube.dimensions.map((dimension, i) => [dimension.id, i]))
  for (const rollup of cube.input.rollups) {
    const indexes = rollup.dimensions.map(id => positions.get(id))
    if (indexes.includes(undefined))
      continue
    const sorted = (indexes as number[]).slice().sort((a, b) => a - b)
    const signature = sorted.join(',')
    let rows = index.get(signature)
    if (!rows) {
      rows = new Map()
      index.set(signature, rows)
    }
    rows.set(tupleKey(sorted.map(i => valueKey(rollup.row[cube.dimensions[i]!.id]))), rollup.row)
  }
  return index
}

/**
 * 一遍聚合出多个分组集。明细行按维度字段（与日期粒度）取键、按度量字段累加；
 * 已聚合行按维度 id 取键、按度量 id 再汇总，不可再汇总的度量在多行汇总处取 rollups 里的汇总值，没有给出时为 null。
 * 没有维度的分组集总有一个格子，没有数据时各度量取空集上的聚合结果。
 */
export function buildCube(cube: CubeInput): CubeLevel[] {
  const { input, dimensions, measures, sets, dates } = cube
  const create = input.aggregated ? createRollupAccumulator : createAccumulator
  const builders = sets.map(() => new Map<string, CellBuilder>())

  function newCell(members: unknown[], memberKeys: string[]): CellBuilder {
    return { members, memberKeys, accumulators: measures.map(measure => create(measure.aggregate, { collate: cube.collate })), count: 0, rows: [] }
  }

  sets.forEach((set, s) => {
    if (set.length === 0)
      builders[s]!.set(tupleKey([]), newCell([], []))
  })

  for (const row of input.rows) {
    const values = dimensions.map((dimension) => {
      if (input.aggregated)
        return row[dimension.id]
      const value = row[dimension.field]
      return dimension.bucket ? dates.bucket(value, dimension.bucket) : value
    })
    const keys = values.map(valueKey)
    const measureValues = measures.map((measure) => {
      if (input.aggregated)
        return row[measure.id]
      return measure.field === undefined ? 1 : row[measure.field]
    })
    sets.forEach((set, s) => {
      const memberKeys = set.map(i => keys[i]!)
      const key = tupleKey(memberKeys)
      const cells = builders[s]!
      let cell = cells.get(key)
      if (!cell) {
        cell = newCell(set.map(i => (isMissing(values[i]) ? null : values[i])), memberKeys)
        cells.set(key, cell)
      }
      cell.count++
      cell.accumulators.forEach((accumulator, m) => accumulator.add(measureValues[m]))
      if (cube.collect === s)
        cell.rows.push(row)
    })
  }

  const rollups = input.aggregated ? rollupIndex(cube) : null
  return sets.map((set, s) => {
    const cells = new Map<string, CubeCell>()
    for (const [key, cell] of builders[s]!) {
      const values: Record<string, unknown> = {}
      measures.forEach((measure, m) => {
        let value = cell.accumulators[m]!.result()
        if (value === NEEDS_ROLLUP) {
          const row = rollups?.get(set.join(','))?.get(key)
          value = row === undefined || isMissing(row[measure.id]) ? null : row[measure.id]
        }
        values[measure.id] = value
      })
      cells.set(key, { members: cell.members, memberKeys: cell.memberKeys, values, count: cell.count, rows: cell.rows })
    }
    return { dimensions: set, cells }
  })
}
