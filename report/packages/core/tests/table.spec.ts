/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { GroupNode, GroupView, TableColumn, TableView } from '../src'
import { describe, expect, it } from 'vitest'
import { buildGroupReport, buildTable, ReportComputeError } from '../src'
import { formulas, lookupEngine, salesData, salesDataset } from './fixtures'

const columns: readonly TableColumn[] = [
  { id: 'product', field: 'product' },
  { id: 'amount', field: 'amount', summary: { aggregate: 'sum' } },
  { id: 'qty', field: 'qty', summary: { aggregate: 'sum' } },
]

function outline(nodes: readonly GroupNode[]): unknown[] {
  return nodes.map(node => ({
    key: node.key,
    summary: node.summary,
    count: node.count,
    ...(node.children.length > 0 ? { children: outline(node.children) } : {}),
    ...(node.rows.length > 0 ? { amounts: node.rows.map(row => row.amount) } : {}),
  }))
}

describe('buildTable', () => {
  const view: TableView = {
    type: 'table',
    dataset: 'sales',
    columns,
    filter: { logic: 'and', conditions: [{ id: 'q', field: 'qty', operator: 'lt', value: 4 }] },
    sort: [{ field: 'amount', direction: 'desc' }],
    limit: 3,
  }

  it('筛选、排序后截取，合计覆盖截取前的全部行', () => {
    const result = buildTable(view, salesDataset, salesData)
    expect(result.rows.map(row => row.amount)).toEqual([100, 80, 50])
    expect(result.count).toBe(5)
    expect(result.summary).toEqual({ amount: 250, qty: 8 })
  })

  it('缺失值排在最后', () => {
    const result = buildTable({ ...view, limit: undefined }, salesDataset, salesData)
    expect(result.rows.map(row => row.amount)).toEqual([100, 80, 50, 20, null])
  })

  it('没有列带汇总时 summary 为 null', () => {
    const result = buildTable({ type: 'table', dataset: 'sales', columns: [{ id: 'p', field: 'product' }] }, salesDataset, salesData)
    expect(result.summary).toBeNull()
    expect(result.rows).toHaveLength(6)
  })

  it('汇总公式以其它列的汇总值为变量', () => {
    const result = buildTable({
      type: 'table',
      dataset: 'sales',
      columns: [...columns, { id: 'unit', field: 'amount', summary: { formula: 'amount / qty' } }],
    }, salesDataset, salesData, { formula: lookupEngine(formulas) })
    expect(result.summary).toEqual({ amount: 280, qty: 12, unit: 280 / 12 })
  })

  it('不接受已聚合数据', () => {
    expect(() => buildTable(view, salesDataset, { kind: 'aggregated', rows: [] })).toThrowError(ReportComputeError)
  })
})

describe('buildGroupReport', () => {
  const view: GroupView = {
    type: 'group',
    dataset: 'sales',
    groups: [{ id: 'region', field: 'region' }],
    columns,
    sort: [{ field: 'amount', direction: 'desc' }],
  }

  it('一级分组：组内明细按 sort 排，组小计与总计', () => {
    const result = buildGroupReport(view, salesDataset, salesData)
    expect(outline(result.groups)).toEqual([
      { key: 'East', summary: { amount: 180, qty: 7 }, count: 3, amounts: [100, 50, 30] },
      { key: 'West', summary: { amount: 80, qty: 4 }, count: 2, amounts: [80, null] },
      { key: null, summary: { amount: 20, qty: 1 }, count: 1, amounts: [20] },
    ])
    expect(result.total).toEqual({ amount: 280, qty: 12 })
    expect(result.count).toBe(6)
  })

  it('多级分组与按日期粒度分组', () => {
    const result = buildGroupReport({
      ...view,
      groups: [
        { id: 'quarter', field: 'date', bucket: 'quarter' },
        { id: 'product', field: 'product' },
      ],
      grandTotal: false,
    }, salesDataset, salesData)
    expect(outline(result.groups)).toEqual([
      {
        key: '2026-Q1',
        summary: { amount: 280, qty: 12 },
        count: 6,
        children: [
          { key: 'A', summary: { amount: 230, qty: 7 }, count: 4, amounts: [100, 80, 30, 20] },
          { key: 'B', summary: { amount: 50, qty: 5 }, count: 2, amounts: [50, null] },
        ],
      },
    ])
    expect(result.total).toBeNull()
    expect(result.groups[0]!.children[0]!.group).toBe('product')
    expect(result.groups[0]!.children[0]!.level).toBe(1)
  })

  it('组可按小计排序', () => {
    const result = buildGroupReport({
      ...view,
      groups: [{ id: 'region', field: 'region', sort: { by: 'qty', direction: 'desc' } }],
    }, salesDataset, salesData)
    expect(result.groups.map(group => group.key)).toEqual(['East', 'West', null])
    const ascending = buildGroupReport({
      ...view,
      groups: [{ id: 'region', field: 'region', sort: { by: 'amount', nulls: 'first' } }],
    }, salesDataset, salesData)
    expect(ascending.groups.map(group => group.key)).toEqual([null, 'West', 'East'])
    expect(() => buildGroupReport({
      ...view,
      groups: [{ id: 'region', field: 'region', sort: { by: 'product' } }],
    }, salesDataset, salesData)).toThrowError(ReportComputeError)
  })

  it('不列明细时没有明细行，可以接受已聚合数据', () => {
    const summaryOnly: GroupView = {
      type: 'group',
      dataset: 'sales',
      groups: [{ id: 'region', field: 'region' }],
      columns: [
        { id: 'amount', field: 'amount', summary: { aggregate: 'sum' } },
        { id: 'avg', field: 'amount', summary: { aggregate: 'avg' } },
      ],
      detail: false,
    }
    expect(buildGroupReport(summaryOnly, salesDataset, salesData).groups[0]!.rows).toEqual([])
    const result = buildGroupReport(summaryOnly, salesDataset, {
      kind: 'aggregated',
      rows: [
        { region: 'East', amount: 130, avg: 65 },
        { region: 'West', amount: 80, avg: 80 },
      ],
      rollups: [{ dimensions: [], row: { avg: 70 } }],
    })
    expect(outline(result.groups)).toEqual([
      { key: 'East', summary: { amount: 130, avg: 65 }, count: 1 },
      { key: 'West', summary: { amount: 80, avg: 80 }, count: 1 },
    ])
    expect(result.total).toEqual({ amount: 210, avg: 70 })
    expect(() => buildGroupReport(view, salesDataset, { kind: 'aggregated', rows: [] })).toThrowError(ReportComputeError)
  })
})
