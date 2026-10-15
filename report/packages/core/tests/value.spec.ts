/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, expect, it } from 'vitest'
import { createRollupAccumulator, NEEDS_ROLLUP, sortRows } from '../src'

describe('createRollupAccumulator', () => {
  function rollup(kind: Parameters<typeof createRollupAccumulator>[0], values: unknown[]): unknown {
    const accumulator = createRollupAccumulator(kind)
    values.forEach(value => accumulator.add(value))
    return accumulator.result()
  }

  it('sum 与 count 相加，min / max 取最值', () => {
    expect(rollup('sum', [10, null, 5])).toBe(15)
    expect(rollup('sum', [])).toBeNull()
    expect(rollup('count', [2, 3])).toBe(5)
    expect(rollup('count', [])).toBe(0)
    expect(rollup('min', [4, 2, null])).toBe(2)
    expect(rollup('max', [4, 2])).toBe(4)
  })

  it('avg 与 distinctCount 只有一个值时原样给出，多个值时需要汇总值', () => {
    expect(rollup('avg', [12.5])).toBe(12.5)
    expect(rollup('avg', [null])).toBeNull()
    expect(rollup('avg', [1, 2])).toBe(NEEDS_ROLLUP)
    expect(rollup('distinctCount', [3, 4])).toBe(NEEDS_ROLLUP)
  })
})

describe('sortRows', () => {
  it('按字段多键排序且不改原数组', () => {
    const rows = [{ a: 1, b: 2 }, { a: 0, b: 9 }, { a: 1, b: 1 }]
    expect(sortRows(rows, [{ field: 'a', direction: 'desc' }, { field: 'b' }])).toEqual([{ a: 1, b: 1 }, { a: 1, b: 2 }, { a: 0, b: 9 }])
    expect(rows[0]).toEqual({ a: 1, b: 2 })
  })

  it('缺失值缺省排最后，nulls: first 排最前', () => {
    const rows = [{ a: null }, { a: 2 }, { a: 1 }]
    expect(sortRows(rows, [{ field: 'a', direction: 'desc' }]).map(row => row.a)).toEqual([2, 1, null])
    expect(sortRows(rows, [{ field: 'a', nulls: 'first' }]).map(row => row.a)).toEqual([null, 1, 2])
  })
})
