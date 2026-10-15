/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, expect, it } from 'vitest'
import { aggregateValues, compareValues, createRollupAccumulator, isMissing, NEEDS_ROLLUP, sortBy, sortRows, valueKey } from '../src'

describe('isMissing', () => {
  it('null、undefined、NaN 与无效 Date 是缺失值', () => {
    expect(isMissing(null)).toBe(true)
    expect(isMissing(undefined)).toBe(true)
    expect(isMissing(Number.NaN)).toBe(true)
    expect(isMissing(new Date('invalid'))).toBe(true)
  })

  it('空字符串、0 与 false 不是缺失值', () => {
    expect(isMissing('')).toBe(false)
    expect(isMissing(0)).toBe(false)
    expect(isMissing(false)).toBe(false)
  })
})

describe('compareValues', () => {
  it('同类型按值比较', () => {
    expect(compareValues(1, 2)).toBe(-1)
    expect(compareValues('b', 'a')).toBe(1)
    expect(compareValues(true, false)).toBe(1)
    expect(compareValues(new Date(2), new Date(1))).toBe(1)
    expect(compareValues(3, 3)).toBe(0)
  })

  it('缺失值大于一切非缺失值', () => {
    expect(compareValues(null, 1)).toBe(1)
    expect(compareValues('z', undefined)).toBe(-1)
    expect(compareValues(null, Number.NaN)).toBe(0)
  })

  it('不同类型按 boolean < number < Date < string 排', () => {
    expect(compareValues(true, 0)).toBe(-1)
    expect(compareValues(9, new Date(0))).toBe(-1)
    expect(compareValues(new Date(0), '0')).toBe(-1)
  })

  it('字符串缺省按码元比较，可换成 collate', () => {
    expect(compareValues('a', 'B')).toBe(1)
    expect(compareValues('a', 'B', (x, y) => x.toLowerCase().localeCompare(y.toLowerCase()))).toBe(-1)
  })
})

describe('valueKey', () => {
  it('同一个值编码相同，类型不同编码不同', () => {
    expect(valueKey(-0)).toBe(valueKey(0))
    expect(valueKey(new Date(5))).toBe(valueKey(new Date(5)))
    expect(valueKey('1')).not.toBe(valueKey(1))
    expect(valueKey(null)).toBe(valueKey(undefined))
    expect(valueKey(Number.NaN)).toBe(valueKey(null))
  })
})

describe('aggregateValues', () => {
  it('sum 用补偿求和，大数之间的小量不丢', () => {
    expect(aggregateValues('sum', [1e16, 1, -1e16])).toBe(1)
    expect(aggregateValues('sum', [1, 2, 3])).toBe(6)
  })

  it('sum / avg 只计有限数值，跳过缺失、字符串与 Infinity', () => {
    const values = [10, null, '5', Number.POSITIVE_INFINITY, undefined, 20, Number.NaN]
    expect(aggregateValues('sum', values)).toBe(30)
    expect(aggregateValues('avg', values)).toBe(15)
  })

  it('空集上 sum / avg / min / max 为 null，count / distinctCount 为 0', () => {
    for (const values of [[], [null, undefined]]) {
      expect(aggregateValues('sum', values)).toBeNull()
      expect(aggregateValues('avg', values)).toBeNull()
      expect(aggregateValues('min', values)).toBeNull()
      expect(aggregateValues('max', values)).toBeNull()
      expect(aggregateValues('count', values)).toBe(0)
      expect(aggregateValues('distinctCount', values)).toBe(0)
    }
  })

  it('count 数非缺失值，distinctCount 数不同的非缺失值', () => {
    const values = ['A', 'B', 'A', null, '', 1, '1']
    expect(aggregateValues('count', values)).toBe(6)
    expect(aggregateValues('distinctCount', values)).toBe(5)
  })

  it('min / max 可用于字符串与日期', () => {
    expect(aggregateValues('min', ['2026-03-01', null, '2026-01-15'])).toBe('2026-01-15')
    expect(aggregateValues('max', ['b', 'a', 'c'])).toBe('c')
    const later = new Date(Date.UTC(2026, 5, 1))
    expect(aggregateValues('max', [new Date(Date.UTC(2026, 0, 1)), later])).toBe(later)
  })
})

describe('createRollupAccumulator', () => {
  function rollup(kind: Parameters<typeof createRollupAccumulator>[0], values: unknown[]): unknown {
    const accumulator = createRollupAccumulator(kind)
    values.forEach(value => accumulator.add(value))
    return accumulator.result()
  }

  it('sum 与 count 相加，min / max 取最值', () => {
    expect(rollup('sum', [10, null, 5])).toBe(15)
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

describe('sortBy', () => {
  const items = [{ v: 2 }, { v: null }, { v: 1 }, { v: 2, tag: 'second' }]

  it('缺失值缺省排最后，与方向无关', () => {
    expect(sortBy(items, [{ value: i => i.v }]).map(i => i.v)).toEqual([1, 2, 2, null])
    expect(sortBy(items, [{ value: i => i.v, direction: 'desc' }]).map(i => i.v)).toEqual([2, 2, 1, null])
  })

  it('nulls: first 把缺失值排最前', () => {
    expect(sortBy(items, [{ value: i => i.v, direction: 'desc', nulls: 'first' }]).map(i => i.v)).toEqual([null, 2, 2, 1])
  })

  it('相等的项保持原有次序', () => {
    const sorted = sortBy(items, [{ value: i => i.v, direction: 'desc' }])
    expect(sorted[1]).toBe(items[3])
    expect(sorted[0]).toBe(items[0])
  })

  it('sortRows 按字段多键排序且不改原数组', () => {
    const rows = [{ a: 1, b: 2 }, { a: 0, b: 9 }, { a: 1, b: 1 }]
    expect(sortRows(rows, [{ field: 'a', direction: 'desc' }, { field: 'b' }])).toEqual([{ a: 1, b: 1 }, { a: 1, b: 2 }, { a: 0, b: 9 }])
    expect(rows[0]).toEqual({ a: 1, b: 2 })
  })
})
