/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView, ReportDocument, TableView } from '../src'
import { describe, expect, it } from 'vitest'
import { applyOperations, datasetUsage, planRemoveDataset, planRemoveField, planRemoveParameter, planRenameField, planRenameParameter } from '../src'

const board: ReportDocument = {
  schemaVersion: 1,
  id: 'board',
  datasets: [
    {
      id: 'sales',
      fields: [
        { name: 'region', type: 'string' },
        { name: 'amount', type: 'number' },
        { name: 'net', type: 'number', formula: 'amount * 0.9 + $bonus' },
      ],
    },
    { id: 'spare', fields: [{ name: 'x', type: 'string' }] },
  ],
  parameters: [{ name: 'bonus', type: 'number' }, { name: 'area', type: 'string' }],
  body: {
    type: 'dashboard',
    grid: { columns: 12, rowHeight: 40 },
    cards: [
      {
        id: 'pie',
        kind: 'chart',
        layout: { x: 0, y: 0, w: 4, h: 4 },
        dataset: 'sales',
        parameters: { area: { parameter: 'area' } },
        query: {
          dimensions: [{ id: 'region', field: 'region' }],
          measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }, { id: 'adj', formula: 'amount + $bonus' }],
          filter: { logic: 'and', conditions: [
            { id: 'c1', field: 'region', operator: 'eq', value: { parameter: 'area' } },
            { id: 'g1', logic: 'or', conditions: [{ id: 'c2', field: 'amount', operator: 'gt', value: 10 }] },
          ] },
        },
        chart: { type: 'pie', nameField: 'region', valueField: 'amount' },
      },
      {
        id: 'list',
        kind: 'table',
        layout: { x: 4, y: 0, w: 8, h: 4 },
        view: {
          type: 'table',
          dataset: 'sales',
          columns: [{ id: 'region', field: 'region' }, { id: 'amount', field: 'amount', summary: { formula: 'amount * $bonus' } }],
          sort: [{ field: 'region' }, { field: 'amount', direction: 'desc' }],
        },
      },
    ],
    links: [{ id: 'byRegion', card: 'list', dimension: 'amount', targets: [{ card: 'pie', field: 'region' }] }],
  },
}

const apply = (operations: Parameters<typeof applyOperations>[1]): ReportDocument => applyOperations(board, operations).document
const cards = (document: ReportDocument): DashboardView['cards'] => (document.body as DashboardView).cards

describe('删除字段', () => {
  it('取这个字段的列表项、筛选条件、明细排序与联动目标一并删掉，报出各删了几处', () => {
    const { operations, cascade } = planRemoveField(board, 'sales', 'region')
    expect(cascade).toEqual({ items: 2, conditions: 1, sorts: 1, links: 1, bindings: 0 })
    const next = apply(operations)
    expect(next.datasets[0]!.fields.map(field => field.name)).toEqual(['amount', 'net'])
    const [pie, list] = cards(next)
    expect(pie).toMatchObject({ query: { dimensions: [], filter: { conditions: [{ id: 'g1' }] } } })
    expect((list as Extract<typeof list, { kind: 'table' }>).view).toMatchObject({ columns: [{ id: 'amount' }], sort: [{ field: 'amount' }] })
    expect((next.body as DashboardView).links).toBeUndefined()
  })

  it('筛选树删空时去掉整个筛选；字段不存在时抛 RangeError', () => {
    const next = apply(planRemoveField(board, 'sales', 'amount').operations)
    expect(cards(next)[0]).toMatchObject({ query: { measures: [{ id: 'adj' }], filter: { conditions: [{ id: 'c1' }] } } })
    expect(() => planRemoveField(board, 'sales', 'ghost')).toThrow(RangeError)
  })
})

describe('删除报表参数', () => {
  it('以它为操作数的筛选条件与引用它的参数绑定一并删掉，公式里的 $名字 不改', () => {
    const { operations, cascade } = planRemoveParameter(board, 'area')
    expect(cascade).toEqual({ items: 0, conditions: 1, sorts: 0, links: 0, bindings: 1 })
    const next = apply(operations)
    expect(next.parameters).toEqual([{ name: 'bonus', type: 'number' }])
    expect(cards(next)[0]).not.toHaveProperty('parameters')
    expect(cards(next)[0]).toMatchObject({ query: { filter: { conditions: [{ id: 'g1' }] } } })
    expect(planRemoveParameter(board, 'bonus').cascade).toEqual({ items: 0, conditions: 0, sorts: 0, links: 0, bindings: 0 })
  })
})

describe('删除数据集', () => {
  it('只在没有卡片与视图使用时可删', () => {
    expect([datasetUsage(board, 'sales'), datasetUsage(board, 'spare')]).toEqual([2, 0])
    expect(planRemoveDataset(board, 'spare')).toEqual([{ type: 'removeDataset', id: 'spare' }])
    expect(() => planRemoveDataset(board, 'sales')).toThrow(RangeError)
  })
})

describe('改名级联到公式', () => {
  it('报表参数改名：操作数、参数绑定与各处公式里的 $名字 一起改', () => {
    const next = apply(planRenameParameter(board, 'bonus', 'extra'))
    expect(next.parameters![0]!.name).toBe('extra')
    expect(next.datasets[0]!.fields[2]!.formula).toBe('amount * 0.9 + $extra')
    expect(cards(next)[0]).toMatchObject({ query: { measures: [{ id: 'amount' }, { id: 'adj', formula: 'amount + $extra' }] } })
    expect((cards(next)[1] as { view: TableView }).view.columns[1]!.summary).toEqual({ formula: 'amount * $extra' })
    const renamed = apply(planRenameParameter(board, 'area', 'zone'))
    expect(cards(renamed)[0]).toMatchObject({ parameters: { area: { parameter: 'zone' } }, query: { filter: { conditions: [{ value: { parameter: 'zone' } }, { id: 'g1' }] } } })
    expect(planRenameParameter(board, 'bonus', 'bonus')).toEqual([])
  })

  it('字段改名：同一数据集里计算字段公式对它的引用一起改，名字要加引号时加上', () => {
    const next = apply(planRenameField(board, 'sales', 'amount', 'gross amount'))
    expect(next.datasets[0]!.fields[2]!.formula).toBe('`gross amount` * 0.9 + $bonus')
    expect(cards(next)[0]).toMatchObject({ query: { measures: [{ field: 'gross amount' }, { id: 'adj', formula: 'amount + $bonus' }] } })
  })
})
