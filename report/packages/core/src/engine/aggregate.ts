/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 聚合累加器：明细值的聚合，以及已聚合值的再汇总。

import type { AggregateKind } from '../schema'
import type { StringCollator } from './value'
import { compareValues, isMissing, valueKey } from './value'

/** 逐个收值、最后给出聚合结果的累加器。 */
export interface Accumulator {
  readonly add: (value: unknown) => void
  readonly result: () => unknown
}

/** 已聚合值无法再汇总、需要使用方另给汇总值的标记。 */
export const NEEDS_ROLLUP: unique symbol = Symbol('needs-rollup')

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function createSum(): { add: (value: number) => void, total: () => number } {
  let sum = 0
  let compensation = 0
  return {
    add(value) {
      const next = sum + value
      if (Math.abs(sum) >= Math.abs(value))
        compensation += (sum - next) + value
      else
        compensation += (value - next) + sum
      sum = next
    },
    total: () => sum + compensation,
  }
}

function sumAccumulator(emptyResult: number | null): Accumulator {
  const sum = createSum()
  let count = 0
  return {
    add(value) {
      if (finite(value)) {
        sum.add(value)
        count++
      }
    },
    result: () => (count === 0 ? emptyResult : sum.total()),
  }
}

function avgAccumulator(): Accumulator {
  const sum = createSum()
  let count = 0
  return {
    add(value) {
      if (finite(value)) {
        sum.add(value)
        count++
      }
    },
    result: () => (count === 0 ? null : sum.total() / count),
  }
}

function countAccumulator(): Accumulator {
  let count = 0
  return {
    add(value) {
      if (!isMissing(value))
        count++
    },
    result: () => count,
  }
}

function extremeAccumulator(direction: 1 | -1, collate?: StringCollator): Accumulator {
  let best: unknown = null
  let seen = false
  return {
    add(value) {
      if (isMissing(value))
        return
      if (!seen || compareValues(value, best, collate) * direction > 0) {
        best = value
        seen = true
      }
    },
    result: () => best,
  }
}

function distinctAccumulator(): Accumulator {
  const keys = new Set<string>()
  return {
    add(value) {
      if (!isMissing(value))
        keys.add(valueKey(value))
    },
    result: () => keys.size,
  }
}

function singleAccumulator(): Accumulator {
  let value: unknown = null
  let count = 0
  return {
    add(next) {
      value = next
      count++
    },
    result: () => (count === 1 ? (isMissing(value) ? null : value) : NEEDS_ROLLUP),
  }
}

/**
 * 明细值的累加器。
 * - sum / avg 只收有限数值，其余值（缺失、字符串、Infinity）跳过；一个数值都没有时结果为 null。
 * - count 数非缺失值；distinctCount 数不同的非缺失值（按 valueKey 判同）；没有值时为 0。
 * - min / max 按 compareValues 在非缺失值里取，可用于数值、日期与字符串；没有值时为 null。
 */
export function createAccumulator(kind: AggregateKind, collate?: StringCollator): Accumulator {
  switch (kind) {
    case 'sum':
      return sumAccumulator(null)
    case 'avg':
      return avgAccumulator()
    case 'count':
      return countAccumulator()
    case 'min':
      return extremeAccumulator(-1, collate)
    case 'max':
      return extremeAccumulator(1, collate)
    case 'distinctCount':
      return distinctAccumulator()
  }
}

/**
 * 已聚合值的再汇总累加器：sum 与 count 相加，min / max 取最值。
 * avg 与 distinctCount 不可再汇总：只收到一个值时原样给出，收到多个时给出 NEEDS_ROLLUP。
 */
export function createRollupAccumulator(kind: AggregateKind, collate?: StringCollator): Accumulator {
  switch (kind) {
    case 'sum':
      return sumAccumulator(null)
    case 'count':
      return sumAccumulator(0)
    case 'min':
      return extremeAccumulator(-1, collate)
    case 'max':
      return extremeAccumulator(1, collate)
    case 'avg':
    case 'distinctCount':
      return singleAccumulator()
  }
}

/** 一组值的聚合结果，规则同 createAccumulator。 */
export function aggregateValues(kind: AggregateKind, values: Iterable<unknown>, collate?: StringCollator): unknown {
  const accumulator = createAccumulator(kind, collate)
  for (const value of values)
    accumulator.add(value)
  return accumulator.result()
}

/** 聚合方式能否由已聚合值再汇总得到。 */
export function isAdditive(kind: AggregateKind): boolean {
  return kind !== 'avg' && kind !== 'distinctCount'
}
