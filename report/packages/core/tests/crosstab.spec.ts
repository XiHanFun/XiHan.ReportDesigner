/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { CrosstabView } from '../src'
import { describe, expect, it } from 'vitest'
import { buildCrosstab } from '../src'
import { formulas, lookupEngine, salesData, salesDataset } from './fixtures'

const view: CrosstabView = {
  type: 'crosstab',
  dataset: 'sales',
  rows: [{ id: 'region', field: 'region' }],
  columns: [{ id: 'product', field: 'product' }],
  measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }],
}

describe('buildCrosstab', () => {
  it('行列交叉，轴末写总计，没有数据落入的格子为 null', () => {
    const result = buildCrosstab(view, salesDataset, salesData)
    expect(result.rows).toEqual([
      { kind: 'member', keys: ['East'] },
      { kind: 'member', keys: ['West'] },
      { kind: 'member', keys: [null] },
      { kind: 'total', keys: [] },
    ])
    expect(result.columns).toEqual([
      { kind: 'member', keys: ['A'] },
      { kind: 'member', keys: ['B'] },
      { kind: 'total', keys: [] },
    ])
    expect(result.measures).toEqual(['amount'])
    expect(result.cells).toEqual([
      [[130], [50], [180]],
      [[80], [null], [80]],
      [[20], [null], [20]],
      [[230], [50], [280]],
    ])
  })

  it('多层维度的小计写在每层成员之后，可关掉总计', () => {
    const result = buildCrosstab({
      ...view,
      rows: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }],
      columns: [],
      measures: [{ id: 'qty', aggregate: 'sum', field: 'qty' }],
      rowTotals: { subtotals: true, grandTotal: false },
    }, salesDataset, salesData)
    expect(result.rows).toEqual([
      { kind: 'member', keys: ['East', 'A'] },
      { kind: 'member', keys: ['East', 'B'] },
      { kind: 'subtotal', keys: ['East'] },
      { kind: 'member', keys: ['West', 'A'] },
      { kind: 'member', keys: ['West', 'B'] },
      { kind: 'subtotal', keys: ['West'] },
      { kind: 'member', keys: [null, 'A'] },
      { kind: 'subtotal', keys: [null] },
    ])
    expect(result.columns).toEqual([{ kind: 'member', keys: [] }])
    expect(result.cells.map(row => row[0]![0])).toEqual([5, 2, 7, 1, 3, 4, 1, 1])
  })

  it('成员可按度量在另一条轴总计上的值排序', () => {
    const result = buildCrosstab({
      ...view,
      rows: [{ id: 'region', field: 'region', sort: { by: 'amount', direction: 'desc' } }],
      columns: [{ id: 'month', field: 'date', bucket: 'month', sort: { direction: 'desc' } }],
      columnTotals: { grandTotal: false },
    }, salesDataset, salesData)
    expect(result.rows.map(row => row.keys[0])).toEqual(['East', 'West', null, undefined])
    expect(result.columns.map(column => column.keys[0])).toEqual(['2026-03', '2026-02', '2026-01'])
    expect(result.cells[0]).toEqual([[30], [50], [100]])
  })

  it('公式度量在小计与总计上按汇总后的值重算', () => {
    const result = buildCrosstab({
      ...view,
      measures: [
        { id: 'amount', aggregate: 'sum', field: 'amount' },
        { id: 'qty', aggregate: 'sum', field: 'qty' },
        { id: 'unit', formula: 'amount / qty' },
      ],
    }, salesDataset, salesData, { formula: lookupEngine(formulas) })
    expect(result.cells[0]![0]).toEqual([130, 5, 26])
    expect(result.cells[0]![2]).toEqual([180, 7, 180 / 7])
    expect(result.cells[2]![1]).toEqual([null, null, null])
    expect(result.cells[3]![2]).toEqual([280, 12, 280 / 12])
  })

  it('已聚合数据按行列维度 id 取键', () => {
    const result = buildCrosstab(view, salesDataset, {
      kind: 'aggregated',
      rows: [
        { region: 'East', product: 'A', amount: 130 },
        { region: 'West', product: 'B', amount: 5 },
      ],
    })
    expect(result.cells).toEqual([
      [[130], [null], [130]],
      [[null], [5], [5]],
      [[130], [5], [135]],
    ])
  })
})
