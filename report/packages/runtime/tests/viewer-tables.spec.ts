// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { CrosstabView, DatasetSchema, GroupView, ReportDocument } from '@xihan-report/core'
import type { XhTableElement } from '@xihan-ui/web-components/define'
import type { XhReportViewer } from '../src'
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

function sectionRows(table: XhTableElement, section: 'body' | 'footer'): string[][] {
  return [...table.querySelectorAll(`[data-xh-part="${section}"] > [data-xh-part="row"]`)].map(row => [...row.querySelectorAll('[data-xh-part="cell"]')].map(cell => cell.textContent ?? ''))
}

function bodyRows(table: XhTableElement): string[][] {
  return sectionRows(table, 'body')
}

/** 点表格里的一格，收集冒泡到页面上的 action。 */
function click(table: XhTableElement, row: string, column: string): unknown[] {
  const seen: unknown[] = []
  const listener = (event: Event): void => {
    seen.push({ from: (event.target as Element).tagName.toLowerCase(), ...(event as CustomEvent).detail })
  }
  document.addEventListener('action', listener)
  const cell = table.querySelector(`[data-xh-part="row"][value="${row}"] [data-xh-part="cell"][value="${column}"]`) as HTMLElement
  cell.click()
  document.removeEventListener('action', listener)
  return seen
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
    expect(sectionRows(table, 'footer')).toEqual([['Total', '', '250']])
    expect(table.querySelectorAll('[data-kind="group"]')).toHaveLength(3)
    expect([table.getAttribute('footer-rows'), table.hasAttribute('sticky-footer')]).toEqual(['1', true])
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

  it('格子取对应的度量，没有数据落入的格子为空；行轴的总计写进吸底的表尾', async () => {
    const table = await show(view)
    expect(bodyRows(table)).toEqual([
      ['East', '100', '1', '50', '1', '150', '2'],
      ['West', '80', '1', '', '', '80', '1'],
      ['(Blank)', '20', '1', '', '', '20', '1'],
    ])
    expect(sectionRows(table, 'footer')).toEqual([['Total', '200', '3', '50', '1', '250', '4']])
    expect(table.rows).toHaveLength(3)
    const footer = table.querySelector('[data-xh-part="footer"] > [data-xh-part="row"]')!
    expect([table.getAttribute('footer-rows'), table.hasAttribute('sticky-footer'), footer.getAttribute('data-kind'), footer.getAttribute('aria-rowindex')]).toEqual(['1', true, 'total', '6'])
  })

  it('度量排在行轴上时总计每个度量一行，表尾按层号排；没有总计时不留表尾', async () => {
    const table = await show({ ...view, measuresOn: 'rows' })
    expect(sectionRows(table, 'footer')).toEqual([['Total', '金额', '200', '50', '250'], ['', '笔数', '3', '1', '4']])
    const footer = [...table.querySelectorAll('[data-xh-part="footer"] > [data-xh-part="row"]')]
    expect(footer.map(row => [row.getAttribute('level'), row.getAttribute('aria-rowindex')])).toEqual([['1', '8'], ['2', '9']])
    expect(table.querySelector('[data-xh-part="root"]')!.getAttribute('aria-rowcount')).toBe('9')
    const none = await show({ ...view, rowTotals: { grandTotal: false } })
    expect([none.hasAttribute('footer-rows'), none.querySelector('[data-xh-part="footer"]')]).toEqual([false, null])
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
    ])
    expect(sectionRows(table, 'footer').map(row => row.slice(0, 2))).toEqual([['Total', '']])
    expect(table.cellSpanOf('r0', 'row0')).toMatchObject({ rowSpan: 3 })
  })
})

describe('<xh-report-viewer>：行主操作', () => {
  it('明细表：查看器转发 action，带上点中的列与这一行各列的取值；里层表格的 action 不外传', async () => {
    const table = await show({ type: 'table', dataset: 'sales', columns: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }, { id: 'amount', field: 'amount' }] })
    expect(click(table, 'r1', 'product')).toEqual([
      { from: 'xh-report-viewer', card: null, link: null, value: null, kind: 'detail', column: 'product', values: { region: 'East', product: 'B', amount: 50 } },
    ])
  })

  it('分组报表：组头报分组的键，点分组列报分组 id；明细行另带各列的取值', async () => {
    const table = await show({ type: 'group', dataset: 'sales', groups: [{ id: 'region', field: 'region' }], columns: [{ id: 'product', field: 'product' }, { id: 'amount', field: 'amount' }] })
    expect(click(table, 'r0', 'g0')).toEqual([expect.objectContaining({ kind: 'group', column: 'region', values: { region: 'East' } })])
    expect(click(table, 'r1', 'amount')).toEqual([expect.objectContaining({ kind: 'detail', column: 'amount', values: { region: 'East', product: 'A', amount: 100 } })])
  })

  it('交叉表：值格报度量 id 与行、列成员，行表头格报行维度 id；总计在表尾，不报行主操作', async () => {
    const table = await show({
      type: 'crosstab',
      dataset: 'sales',
      rows: [{ id: 'region', field: 'region' }],
      columns: [{ id: 'product', field: 'product' }],
      measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }, { id: 'n', aggregate: 'count' }],
    })
    expect(click(table, 'r0', 'c2')).toEqual([expect.objectContaining({ kind: 'detail', column: 'amount', values: { region: 'East', product: 'B' } })])
    expect(click(table, 'r1', 'row0')).toEqual([expect.objectContaining({ kind: 'detail', column: 'region', values: { region: 'West' } })])
    const seen: Event[] = []
    const listener = (event: Event): void => {
      seen.push(event)
    }
    document.addEventListener('action', listener)
    table.querySelector<HTMLElement>('[data-xh-part="footer"] [data-xh-part="cell"]')!.click()
    document.removeEventListener('action', listener)
    expect(seen).toEqual([])
  })
})

describe('<xh-report-viewer>：表格的可及名', () => {
  const columns = [{ id: 'region', field: 'region' }, { id: 'amount', field: 'amount' }]

  async function tables(schema: Omit<ReportDocument, 'schemaVersion' | 'id' | 'datasets'>): Promise<HTMLElement[]> {
    const viewer = document.createElement('xh-report-viewer') as XhReportViewer
    viewer.timeZone = 'UTC'
    viewer.dataProvider = async () => ({ kind: 'rows', rows })
    viewer.schema = { schemaVersion: 1, id: 'demo', datasets: [dataset], ...schema } as ReportDocument
    document.body.append(viewer)
    await viewer.refresh()
    const found = [...viewer.querySelectorAll<XhTableElement>('xh-table')]
    await Promise.all(found.map(table => table.updateComplete))
    return found.map(table => table.querySelector<HTMLElement>('[data-xh-part="root"]')!)
  }

  it('报表主体的表格以报表标题命名，没有标题时取数据集的标题或 id；不放标题，根上不留空引用', async () => {
    const [titled] = await tables({ title: '销售明细', body: { type: 'table', dataset: 'sales', columns } })
    expect([titled!.getAttribute('aria-label'), titled!.getAttribute('aria-labelledby')]).toEqual(['销售明细', null])
    document.body.replaceChildren()
    const [untitled] = await tables({ body: { type: 'table', dataset: 'sales', columns } })
    expect(untitled!.getAttribute('aria-label')).toBe('sales')
  })

  it('表格卡片以卡片标题命名，没有标题时取数据集的标题或 id', async () => {
    const roots = await tables({
      title: '看板',
      body: {
        type: 'dashboard',
        grid: { columns: 12, rowHeight: 40 },
        cards: [
          { id: 'a', kind: 'table', title: '区域金额', layout: { x: 0, y: 0, w: 6, h: 4 }, view: { type: 'table', dataset: 'sales', columns } },
          { id: 'b', kind: 'table', layout: { x: 6, y: 0, w: 6, h: 4 }, view: { type: 'crosstab', dataset: 'sales', rows: [{ id: 'region', field: 'region' }], columns: [], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] } },
        ],
      },
    })
    expect(roots.map(root => root.getAttribute('aria-label'))).toEqual(['区域金额', 'sales'])
  })
})
