// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DatasetData, DatasetRequest, DatasetSchema, ReportDocument, TableView } from '@xihan-report/core'
import type { XhReportViewer } from '../src'
import { setXhConfig } from '@xihan-ui/web-components'
import { afterEach, describe, expect, it } from 'vitest'
import { defineReportViewer } from '../src'
import { reportZhCN } from '../src/locale'

defineReportViewer()

const dataset: DatasetSchema = {
  id: 'sales',
  fields: [
    { name: 'region', type: 'string', title: '区域' },
    { name: 'date', type: 'date', title: '日期' },
    { name: 'amount', type: 'number', title: '金额' },
  ],
  parameters: [{ name: 'year', type: 'number' }],
}

const rows = [
  { region: 'East', date: '2026-01-15', amount: 1200.5 },
  { region: 'West', date: '2026-02-03', amount: null },
  { region: null, date: '2026-03-01', amount: 30 },
]

const table: TableView = {
  type: 'table',
  dataset: 'sales',
  columns: [
    { id: 'region', field: 'region', width: 120 },
    { id: 'date', field: 'date' },
    { id: 'amount', field: 'amount', title: '销售额', format: { kind: 'number', decimals: 2, grouping: true }, summary: { aggregate: 'sum' }, align: 'end' },
  ],
}

function documentOf(body: ReportDocument['body'], extra: Partial<ReportDocument> = {}): ReportDocument {
  return { schemaVersion: 1, id: 'demo', datasets: [dataset], body, ...extra } as ReportDocument
}

function mount(schema: ReportDocument, provider: (request: DatasetRequest, context: { signal: AbortSignal }) => Promise<DatasetData>): XhReportViewer {
  const viewer = document.createElement('xh-report-viewer')
  viewer.timeZone = 'UTC'
  viewer.dataProvider = provider
  viewer.schema = schema
  document.body.append(viewer)
  return viewer
}

function cellTexts(row: Element): string[] {
  return [...row.querySelectorAll('[data-xh-part="cell"]')].map(cell => cell.textContent ?? '')
}

afterEach(() => {
  document.body.replaceChildren()
  setXhConfig({})
})

describe('<xh-report-viewer>：明细表', () => {
  it('取数后排成 xh-table：列定义、行、格式化的单元格与表尾合计', async () => {
    const requests: DatasetRequest[] = []
    const viewer = mount(documentOf(table), async (request) => {
      requests.push(request)
      return { kind: 'rows', rows }
    })
    await viewer.refresh()
    expect(requests.at(-1)).toMatchObject({ dataset: 'sales', query: null, sort: [] })
    expect(viewer.dataset.state).toBe('ready')
    const element = viewer.querySelector('xh-table') as HTMLElement & { columns: unknown[], rows: unknown[] }
    expect(element.columns).toEqual([
      { id: 'region', label: '区域', width: 120 },
      { id: 'date', label: '日期' },
      { id: 'amount', label: '销售额', align: 'end' },
    ])
    expect(element.rows).toEqual([{ id: 'r0' }, { id: 'r1' }, { id: 'r2' }])
    const header = [...element.querySelectorAll('[data-xh-part="column-label"]')].map(label => label.textContent)
    expect(header).toEqual(['区域', '日期', '销售额'])
    const body = [...element.querySelectorAll('[data-xh-part="body"] > [data-xh-part="row"]')]
    expect(body.map(cellTexts)).toEqual([
      ['East', '2026-01-15', '1,200.50'],
      ['West', '2026-02-03', ''],
      ['', '2026-03-01', '30.00'],
    ])
    const footer = element.querySelector('[data-xh-part="footer"] [data-xh-part="row"]')!
    expect(cellTexts(footer)).toEqual(['Total', '', '1,230.50'])
    expect(element.hasAttribute('footer')).toBe(true)
  })

  it('行数超过阈值时表体交给 xh-virtualizer', async () => {
    const many = Array.from({ length: 500 }, (_, index) => ({ region: `R${index}`, date: '2026-01-01', amount: index }))
    const viewer = mount(documentOf(table), async () => ({ kind: 'rows', rows: many }))
    await viewer.refresh()
    const virtualizer = viewer.querySelector('xh-table xh-virtualizer')!
    expect(virtualizer.getAttribute('count')).toBe('500')
    expect((viewer.querySelector('xh-table') as HTMLElement & { rows: unknown[] }).rows).toHaveLength(500)
  })

  it('formatter、locale 与语言包改变显示文字，不重新取数', async () => {
    let calls = 0
    const viewer = mount(documentOf(table), async () => {
      calls++
      return { kind: 'rows', rows }
    })
    await viewer.refresh()
    const before = calls
    setXhConfig(reportZhCN)
    viewer.formatter = value => `<${String(value)}>`
    await viewer.updateComplete
    expect(calls).toBe(before)
    const footer = viewer.querySelector('[data-xh-part="footer"] [data-xh-part="row"]')!
    expect(cellTexts(footer)).toEqual(['总计', '', '<1230.5>'])
    expect(viewer.getAttribute('aria-label')).toBe('报表')
  })
})

describe('<xh-report-viewer>：状态与事件', () => {
  it('报表定义有 error 级问题时不取数，派发 issues-change', async () => {
    let calls = 0
    const viewer = mount(documentOf({ ...table, dataset: 'ghost' }), async () => {
      calls++
      return { kind: 'rows', rows }
    })
    const changes: unknown[] = []
    viewer.addEventListener('issues-change', event => changes.push((event as CustomEvent).detail.issues))
    await viewer.refresh()
    expect(calls).toBe(0)
    expect(viewer.dataset.state).toBe('invalid')
    expect(viewer.issues.map(issue => [issue.code, issue.severity])).toContainEqual(['unknown-dataset', 'error'])
    expect(viewer.querySelector('[data-part="status"]')!.textContent).toBe('This report definition has problems and cannot be shown')
    expect(changes.length).toBeGreaterThan(0)
  })

  it('参数不合格时不取数，状态为 parameters', async () => {
    const schema = documentOf(table, { parameters: [{ name: 'region', type: 'string', required: true }] })
    let calls = 0
    const viewer = mount(schema, async () => {
      calls++
      return { kind: 'rows', rows }
    })
    await viewer.refresh()
    expect(calls).toBe(0)
    expect(viewer.dataset.state).toBe('parameters')
    expect(viewer.issues.some(issue => issue.code === 'parameter-required')).toBe(true)
    viewer.parameters = { region: 'East' }
    await viewer.refresh()
    expect(viewer.dataset.state).toBe('ready')
    expect(calls).toBeGreaterThan(0)
  })

  it('取数失败时派发 load-error，状态为 error', async () => {
    const viewer = mount(documentOf(table), async () => {
      throw new Error('offline')
    })
    const errors: unknown[] = []
    viewer.addEventListener('load-error', event => errors.push((event as CustomEvent).detail))
    await viewer.refresh()
    expect(viewer.dataset.state).toBe('error')
    expect(errors.at(-1)).toMatchObject({ card: null, error: new Error('offline') })
  })

  it('新的取数开始时取消旧请求，旧结果不落地；loading-change 成对出现', async () => {
    const signals: AbortSignal[] = []
    const releases: (() => void)[] = []
    const viewer = mount(documentOf(table), (_request, context) => {
      signals.push(context.signal)
      return new Promise<DatasetData>((resolve) => {
        const index = releases.length
        releases.push(() => resolve({ kind: 'rows', rows: rows.slice(0, index + 1) }))
      })
    })
    const loading: boolean[] = []
    viewer.addEventListener('loading-change', event => loading.push((event as CustomEvent).detail.loading))
    await viewer.updateComplete
    const second = viewer.refresh()
    expect(signals[0]!.aborted).toBe(true)
    releases[1]!()
    await second
    releases[0]!()
    await Promise.resolve()
    expect((viewer.querySelector('xh-table') as HTMLElement & { rows: unknown[] }).rows).toHaveLength(2)
    expect(viewer.loading).toBe(false)
    expect(loading.at(-1)).toBe(false)
  })
})
