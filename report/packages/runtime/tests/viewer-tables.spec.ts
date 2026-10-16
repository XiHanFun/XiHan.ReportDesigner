// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { CrosstabView, DatasetSchema, GroupView, ReportDocument } from '@xihan-report/core'
import type { XhTableElement } from '@xihan-ui/web-components/define'
import type { XhReportViewer } from '../src'
import { defineXhElements } from '@xihan-ui/web-components/define'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { defineReportViewer } from '../src'

const dataset: DatasetSchema = {
  id: 'sales',
  fields: [
    { name: 'region', type: 'string', title: '区域' },
    { name: 'product', type: 'string', title: '产品' },
    { name: 'amount', type: 'number', title: '金额' },
  ],
}

const rows = [
  { region: 'East', product: 'A', amount: 100 },
  { region: 'East', product: 'B', amount: 50 },
  { region: 'West', product: 'A', amount: 80 },
  { region: null, product: 'A', amount: 20 },
]

beforeAll(() => {
  defineXhElements()
  defineReportViewer()
})

afterEach(() => {
  document.body.replaceChildren()
})

async function show(body: ReportDocument['body']): Promise<XhTableElement> {
  const viewer = document.createElement('xh-report-viewer') as XhReportViewer
  viewer.timeZone = 'UTC'
  viewer.dataProvider = async () => ({ kind: 'rows', rows })
  viewer.schema = { schemaVersion: 1, id: 'demo', datasets: [dataset], body } as ReportDocument
  document.body.append(viewer)
  await viewer.refresh()
  const table = viewer.querySelector('xh-table') as XhTableElement
  await table.updateComplete
  return table
}

function bodyRows(table: XhTableElement): string[][] {
  return [...table.querySelectorAll('[data-xh-part="body"] > [data-xh-part="row"]')].map(row => [...row.querySelectorAll('[data-xh-part="cell"]')].map(cell => cell.textContent ?? ''))
}

describe('<xh-report-viewer>：分组报表', () => {
  const view: GroupView = {
    type: 'group',
    dataset: 'sales',
    groups: [{ id: 'region', field: 'region' }],
    columns: [
      { id: 'product', field: 'product' },
      { id: 'amount', field: 'amount', summary: { aggregate: 'sum' } },
    ],
  }

  it('每级分组占一列冻结在行首，组头、明细与小计依次成行，总计写进表尾', async () => {
    const table = await show(view)
    expect(table.columns).toEqual([
      { id: 'g0', label: '区域', width: '8rem', sticky: 'start' },
      { id: 'product', label: '产品', width: '8rem' },
      { id: 'amount', label: '金额', width: '8rem' },
    ])
    expect(bodyRows(table)).toEqual([
      ['East', '', ''],
      ['', 'A', '100'],
      ['', 'B', '50'],
      ['Subtotal', '', '150'],
      ['West', '', ''],
      ['', 'A', '80'],
      ['Subtotal', '', '80'],
      ['(Blank)', '', ''],
      ['', 'A', '20'],
      ['Subtotal', '', '20'],
    ])
    const footer = table.querySelector('[data-xh-part="footer"] [data-xh-part="row"]')!
    expect([...footer.querySelectorAll('[data-xh-part="cell"]')].map(cell => cell.textContent)).toEqual(['Total', '', '250'])
    expect(table.querySelectorAll('[data-kind="group"]')).toHaveLength(3)
  })

  it('组头的键只横跨其后的分组列，留在冻结区里', async () => {
    const two = await show({ ...view, groups: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }], columns: [{ id: 'amount', field: 'amount', summary: { aggregate: 'sum' } }] })
    expect(two.cellSpanOf('r0', 'g0')).toMatchObject({ colSpan: 2 })
    expect(two.cellSpanOf('r1', 'g1')).toMatchObject({ colSpan: 1 })
    const one = await show(view)
    expect(one.cellSpanOf('r0', 'g0')).toMatchObject({ colSpan: 1, rowSpan: 1 })
  })

  it('不列明细时最后一级每组一行，带上小计', async () => {
    const table = await show({ ...view, detail: false })
    expect(bodyRows(table)).toEqual([['East', '', '150'], ['West', '', '80'], ['(Blank)', '', '20']])
  })
})

describe('<xh-report-viewer>：交叉表', () => {
  const view: CrosstabView = {
    type: 'crosstab',
    dataset: 'sales',
    rows: [{ id: 'region', field: 'region' }],
    columns: [{ id: 'product', field: 'product' }],
    measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }, { id: 'n', aggregate: 'count', title: '笔数' }],
  }

  it('列维度成员与度量组成多级表头，行维度冻结在行首', async () => {
    const table = await show(view)
    const columns = table.columns!
    expect(columns[0]).toMatchObject({ id: 'row0', label: '区域', sticky: 'start' })
    expect(columns.slice(1).map(column => [column.label, column.children?.map(child => child.label)])).toEqual([
      ['A', ['金额', '笔数']],
      ['B', ['金额', '笔数']],
      ['Total', ['金额', '笔数']],
    ])
    const header = [...table.querySelectorAll('[data-xh-part="header"] > [data-xh-part="row"]')]
    expect(header.map(row => row.getAttribute('level'))).toEqual(['1', '2'])
    expect([...header[0]!.querySelectorAll('[data-xh-part="column-label"]')].map(label => label.textContent)).toContain('Total')
  })

  it('格子取对应的度量，没有数据落入的格子为空，总计行加重', async () => {
    const table = await show(view)
    expect(bodyRows(table)).toEqual([
      ['East', '100', '1', '50', '1', '150', '2'],
      ['West', '80', '1', '', '', '80', '1'],
      ['(Blank)', '20', '1', '', '', '20', '1'],
      ['Total', '200', '3', '50', '1', '250', '4'],
    ])
    expect(table.querySelector('[data-xh-part="row"][value="r3"]')!.getAttribute('data-kind')).toBe('subtotal')
  })

  it('两层行维度：上层成员纵向合并，小计与总计的标签横跨剩余的行表头列', async () => {
    const table = await show({ ...view, rows: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }], columns: [], measures: [view.measures[0]!], rowTotals: { subtotals: true } })
    expect(bodyRows(table).map(row => row.slice(0, 2))).toEqual([
      ['East', 'A'],
      ['', 'B'],
      ['', 'Subtotal'],
      ['West', 'A'],
      ['', 'Subtotal'],
      ['(Blank)', 'A'],
      ['', 'Subtotal'],
      ['Total', ''],
    ])
    expect(table.cellSpanOf('r0', 'row0')).toMatchObject({ rowSpan: 3 })
    expect(table.cellSpanOf('r7', 'row0')).toMatchObject({ colSpan: 2 })
  })
})
