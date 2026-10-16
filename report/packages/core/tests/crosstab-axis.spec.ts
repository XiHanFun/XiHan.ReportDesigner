/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { CrosstabAxisNode, CrosstabLabel, CrosstabView } from '../src'
import { describe, expect, it } from 'vitest'
import { buildCrosstab, crosstabAxes } from '../src'
import { salesData, salesDataset } from './fixtures'

const amount = { id: 'amount', aggregate: 'sum', field: 'amount' } as const
const qty = { id: 'qty', aggregate: 'sum', field: 'qty' } as const

function text(label: CrosstabLabel | null): string | null {
  if (label === null)
    return null
  switch (label.kind) {
    case 'member':
      return String(label.value)
    case 'measure':
      return label.measure.id
    default:
      return label.kind
  }
}

function outline(nodes: readonly CrosstabAxisNode[]): unknown[] {
  return nodes.map(node => [text(node.label), node.level, node.span, node.start, node.count, ...(node.children.length > 0 ? [outline(node.children)] : [])])
}

describe('crosstabAxes', () => {
  it('两层行维度：成员合并、小计与总计向内合并', () => {
    const view: CrosstabView = {
      type: 'crosstab',
      dataset: 'sales',
      rows: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }],
      columns: [],
      measures: [amount],
      rowTotals: { subtotals: true },
    }
    const { rows, columns } = crosstabAxes(view, buildCrosstab(view, salesDataset, salesData))
    expect(rows.levels).toBe(2)
    expect(rows.leaves.map(leaf => leaf.labels.map(text))).toEqual([
      ['East', 'A'],
      ['East', 'B'],
      ['East', 'subtotal'],
      ['West', 'A'],
      ['West', 'B'],
      ['West', 'subtotal'],
      ['null', 'A'],
      ['null', 'subtotal'],
      ['total', null],
    ])
    expect(rows.leaves.map(leaf => leaf.emphasis)).toEqual([false, false, true, false, false, true, false, true, true])
    expect(outline(rows.tree)).toEqual([
      ['East', 0, 1, 0, 3, [['A', 1, 1, 0, 1], ['B', 1, 1, 1, 1], ['subtotal', 1, 1, 2, 1]]],
      ['West', 0, 1, 3, 3, [['A', 1, 1, 3, 1], ['B', 1, 1, 4, 1], ['subtotal', 1, 1, 5, 1]]],
      ['null', 0, 1, 6, 2, [['A', 1, 1, 6, 1], ['subtotal', 1, 1, 7, 1]]],
      ['total', 0, 2, 8, 1],
    ])
    expect(columns.levels).toBe(1)
    expect(outline(columns.tree)).toEqual([['amount', 0, 1, 0, 1]])
  })

  it('多个度量缺省排在列轴最内层，总计的标签跨过维度层停在度量之上', () => {
    const view: CrosstabView = {
      type: 'crosstab',
      dataset: 'sales',
      rows: [{ id: 'region', field: 'region' }],
      columns: [{ id: 'product', field: 'product' }],
      measures: [amount, qty],
    }
    const { rows, columns } = crosstabAxes(view, buildCrosstab(view, salesDataset, salesData))
    expect(rows.levels).toBe(1)
    expect(rows.leaves.every(leaf => leaf.measure === null)).toBe(true)
    expect(columns.levels).toBe(2)
    expect(columns.leaves.map(leaf => [leaf.header, leaf.measure])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]])
    expect(outline(columns.tree)).toEqual([
      ['A', 0, 1, 0, 2, [['amount', 1, 1, 0, 1], ['qty', 1, 1, 1, 1]]],
      ['B', 0, 1, 2, 2, [['amount', 1, 1, 2, 1], ['qty', 1, 1, 3, 1]]],
      ['total', 0, 1, 4, 2, [['amount', 1, 1, 4, 1], ['qty', 1, 1, 5, 1]]],
    ])
  })

  it('measuresOn 为 rows 时度量排在行轴最内层', () => {
    const view: CrosstabView = {
      type: 'crosstab',
      dataset: 'sales',
      rows: [{ id: 'region', field: 'region' }],
      columns: [{ id: 'product', field: 'product' }],
      measures: [amount, qty],
      measuresOn: 'rows',
    }
    const { rows, columns } = crosstabAxes(view, buildCrosstab(view, salesDataset, salesData))
    expect(rows.levels).toBe(2)
    expect(rows.leaves).toHaveLength(8)
    expect(columns.levels).toBe(1)
    expect(columns.leaves.every(leaf => leaf.measure === null)).toBe(true)
  })
})
