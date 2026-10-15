/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 明细行按排序规则排序。

import type { CollateOptions } from '@xihan-ui/viz'
import type { DataRow, RowSortRule } from '../schema'
import { sortBy } from '@xihan-ui/viz'

/** 按明细排序规则排序行，返回新数组。 */
export function sortRows(rows: readonly DataRow[], rules: readonly RowSortRule[], options: CollateOptions = {}): DataRow[] {
  return sortBy(rows, rules.map(rule => ({ value: (row: DataRow) => row[rule.field], direction: rule.direction, nulls: rule.nulls })), options)
}
