/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DatasetAggregated, ReportQuery } from '../src'
import { describe, expect, it } from 'vitest'
import { ReportComputeError, runQuery } from '../src'
import { formulas, lookupEngine, salesData, salesDataset } from './fixtures'

const byRegion: ReportQuery = {
  dimensions: [{ id: 'region', field: 'region' }],
  measures: [
    { id: 'amount', aggregate: 'sum', field: 'amount' },
    { id: 'orders', aggregate: 'count' },
    { id: 'priced', aggregate: 'count', field: 'amount' },
    { id: 'avg', aggregate: 'avg', field: 'amount' },
    { id: 'products', aggregate: 'distinctCount', field: 'product' },
    { id: 'first', aggregate: 'min', field: 'date' },
  ],
}

describe('runQuery', () => {
  it('按维度分组聚合，缺失的维度值自成一组并排最后', () => {
    const result = runQuery(byRegion, salesDataset, salesData)
    expect(result.rows).toEqual([
      { region: 'East', amount: 180, orders: 3, priced: 3, avg: 60, products: 2, first: '2026-01-15' },
      { region: 'West', amount: 80, orders: 2, priced: 1, avg: 80, products: 2, first: '2026-01-20' },
      { region: null, amount: 20, orders: 1, priced: 1, avg: 20, products: 1, first: '2026-03-01' },
    ])
    expect(result.total).toEqual({ amount: 280, orders: 6, priced: 5, avg: 56, products: 2, first: '2026-01-15' })
  })

  it('同一输入多次计算结果相同', () => {
    expect(runQuery(byRegion, salesDataset, salesData)).toEqual(runQuery(byRegion, salesDataset, salesData))
  })

  it('维度按日期粒度取键', () => {
    const result = runQuery({
      dimensions: [{ id: 'month', field: 'date', bucket: 'month' }],
      measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }],
    }, salesDataset, salesData)
    expect(result.rows).toEqual([
      { month: '2026-01', amount: 180 },
      { month: '2026-02', amount: 50 },
      { month: '2026-03', amount: 50 },
    ])
  })

  it('维度可按度量排序，limit 截取后 total 仍是全部数据', () => {
    const result = runQuery({
      dimensions: [{ id: 'region', field: 'region', sort: { by: 'amount', direction: 'desc' } }],
      measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }],
      limit: 2,
    }, salesDataset, salesData)
    expect(result.rows).toEqual([{ region: 'East', amount: 180 }, { region: 'West', amount: 80 }])
    expect(result.total).toEqual({ amount: 280 })
  })

  it('显式 sort 覆盖维度次序，引用不存在的键抛出 unknown-sort-key', () => {
    const query: ReportQuery = {
      dimensions: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }],
      measures: [{ id: 'qty', aggregate: 'sum', field: 'qty' }],
      sort: [{ key: 'qty', direction: 'desc' }],
    }
    expect(runQuery(query, salesDataset, salesData).rows.map(row => row.qty)).toEqual([5, 3, 2, 1, 1])
    expect(() => runQuery({ ...query, sort: [{ key: 'nope' }] }, salesDataset, salesData)).toThrowError(ReportComputeError)
  })

  it('筛选后再聚合，没有维度时只有一行', () => {
    const result = runQuery({
      dimensions: [],
      measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }],
      filter: { logic: 'and', conditions: [{ id: 'east', field: 'region', operator: 'eq', value: 'East' }] },
    }, salesDataset, salesData)
    expect(result.rows).toEqual([{ amount: 180 }])
    expect(result.total).toEqual({ amount: 180 })
  })

  it('没有数据时没有结果行，total 取空集上的聚合', () => {
    const result = runQuery(byRegion, salesDataset, { kind: 'rows', rows: [] })
    expect(result.rows).toEqual([])
    expect(result.total).toEqual({ amount: null, orders: 0, priced: 0, avg: null, products: 0, first: null })
  })

  it('公式度量在聚合值上求值，引用其它公式度量时先算被引用的', () => {
    const engine = lookupEngine(formulas)
    const result = runQuery({
      dimensions: [{ id: 'region', field: 'region' }],
      measures: [
        { id: 'plus', formula: 'double + 1' },
        { id: 'double', formula: 'amount * 2' },
        { id: 'amount', aggregate: 'sum', field: 'amount' },
      ],
    }, salesDataset, salesData, { formula: engine })
    expect(result.rows[0]).toEqual({ region: 'East', amount: 180, double: 360, plus: 361 })
    expect(result.total).toEqual({ amount: 280, double: 560, plus: 561 })
  })
})

describe('runQuery：已聚合数据', () => {
  const query: ReportQuery = {
    dimensions: [{ id: 'region', field: 'region' }],
    measures: [
      { id: 'amount', aggregate: 'sum', field: 'amount' },
      { id: 'orders', aggregate: 'count' },
      { id: 'avg', aggregate: 'avg', field: 'amount' },
      { id: 'top', aggregate: 'max', field: 'amount' },
    ],
  }
  const data: DatasetAggregated = {
    kind: 'aggregated',
    rows: [
      { region: 'East', product: 'A', amount: 130, orders: 2, avg: 65, top: 100 },
      { region: 'East', product: 'B', amount: 50, orders: 1, avg: 50, top: 50 },
      { region: 'West', product: 'A', amount: 80, orders: 1, avg: 80, top: 80 },
    ],
    rollups: [
      { dimensions: ['region'], row: { region: 'East', avg: 60 } },
      { dimensions: [], row: { avg: 65 } },
    ],
  }

  it('可累加的度量再汇总，不可累加的取单行原值或使用方给的汇总值', () => {
    const result = runQuery(query, salesDataset, data)
    expect(result.rows).toEqual([
      { region: 'East', amount: 180, orders: 3, avg: 60, top: 100 },
      { region: 'West', amount: 80, orders: 1, avg: 80, top: 80 },
    ])
    expect(result.total).toEqual({ amount: 260, orders: 4, avg: 65, top: 100 })
  })

  it('需要汇总值而使用方没给时为 null', () => {
    const result = runQuery(query, salesDataset, { kind: 'aggregated', rows: data.rows })
    expect(result.rows[0]!.avg).toBeNull()
    expect(result.rows[1]!.avg).toBe(80)
    expect(result.total.avg).toBeNull()
  })

  it('已聚合数据不再筛选', () => {
    const filtered = runQuery({
      ...query,
      filter: { logic: 'and', conditions: [{ id: 'x', field: 'region', operator: 'eq', value: 'West' }] },
    }, salesDataset, data)
    expect(filtered.rows).toHaveLength(2)
  })
})
