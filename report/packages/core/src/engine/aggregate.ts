/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 已聚合值的再汇总；明细值的聚合用 @xihan-ui/viz 的 createAccumulator。

import type { Accumulator, AggregateKind, CollateOptions } from '@xihan-ui/viz'
import { createAccumulator, isMissing } from '@xihan-ui/viz'

/** 已聚合值无法再汇总、需要使用方另给汇总值的标记。 */
export const NEEDS_ROLLUP: unique symbol = Symbol('needs-rollup')

function countRollup(): Accumulator {
  const total = createAccumulator('sum')
  return { add: total.add, result: () => total.result() ?? 0 }
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
 * 已聚合值的再汇总累加器：sum 与 count 相加，min / max 取最值，规则同 createAccumulator。
 * avg 与 distinctCount 不可再汇总：只收到一个值时原样给出，收到多个时给出 NEEDS_ROLLUP。
 */
export function createRollupAccumulator(kind: AggregateKind, options: CollateOptions = {}): Accumulator {
  switch (kind) {
    case 'sum':
    case 'min':
    case 'max':
      return createAccumulator(kind, options)
    case 'count':
      return countRollup()
    case 'avg':
    case 'distinctCount':
      return singleAccumulator()
  }
}

/** 聚合方式能否由已聚合值再汇总得到。 */
export function isAdditive(kind: AggregateKind): boolean {
  return kind !== 'avg' && kind !== 'distinctCount'
}
