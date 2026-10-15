/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 多键稳定排序。

import type { DataRow, NullsPosition, RowSortRule, SortDirection } from '../schema'
import type { StringCollator } from './value'
import { compareValues, isMissing } from './value'

/** 一个排序键。 */
export interface SortKey<T> {
  readonly value: (item: T) => unknown
  /** 缺省 asc。 */
  readonly direction?: SortDirection
  /** 缺省 last。 */
  readonly nulls?: NullsPosition
}

/** 按一个排序键比较两个值。 */
export function compareByKey(a: unknown, b: unknown, direction: SortDirection = 'asc', nulls: NullsPosition = 'last', collate?: StringCollator): number {
  const am = isMissing(a)
  const bm = isMissing(b)
  if (am || bm) {
    if (am === bm)
      return 0
    return (am ? 1 : -1) * (nulls === 'first' ? -1 : 1)
  }
  const order = compareValues(a, b, collate)
  return direction === 'desc' ? -order : order
}

/**
 * 按多个键排序，返回新数组。缺失值按 nulls 排在最前或最后，与方向无关；
 * 全部键都相等的项保持原有次序。
 */
export function sortBy<T>(items: readonly T[], keys: readonly SortKey<T>[], collate?: StringCollator): T[] {
  if (keys.length === 0)
    return items.slice()
  const decorated = items.map((item, index) => ({ item, index, values: keys.map(key => key.value(item)) }))
  decorated.sort((a, b) => {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!
      const order = compareByKey(a.values[i], b.values[i], key.direction, key.nulls, collate)
      if (order !== 0)
        return order
    }
    return a.index - b.index
  })
  return decorated.map(entry => entry.item)
}

/** 按明细排序规则排序行，返回新数组。 */
export function sortRows(rows: readonly DataRow[], rules: readonly RowSortRule[], collate?: StringCollator): DataRow[] {
  return sortBy(rows, rules.map(rule => ({ value: (row: DataRow) => row[rule.field], direction: rule.direction, nulls: rule.nulls })), collate)
}
