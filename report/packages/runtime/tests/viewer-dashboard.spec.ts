// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView, DatasetData, DatasetRequest, DatasetSchema, ReportDocument } from '@xihan-report/core'
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
]

const amount = { id: 'amount', aggregate: 'sum', field: 'amount' } as const

const dashboard: DashboardView = {
  type: 'dashboard',
  grid: { columns: 12, rowHeight: 40 },
  cards: [
    {
      id: 'byRegion',
      kind: 'chart',
      title: '各区域',
      layout: { x: 0, y: 0, w: 6, h: 6 },
      dataset: 'sales',
      query: { dimensions: [{ id: 'region', field: 'region' }], measures: [amount] },
      chart: { type: 'pie', nameField: 'region', valueField: 'amount' },
    },
    {
      id: 'byProduct',
      kind: 'chart',
      layout: { x: 6, y: 0, w: 6, h: 6 },
      dataset: 'sales',
      query: { dimensions: [{ id: 'product', field: 'product' }], measures: [amount] },
      chart: { type: 'cartesian', series: [{ id: 's', mark: 'bar', x: 'product', y: 'amount' }] },
    },
    {
      id: 'total',
      kind: 'metric',
      layout: { x: 0, y: 6, w: 4, h: 3 },
      dataset: 'sales',
      query: { dimensions: [], measures: [amount] },
      metric: { value: 'amount', suffix: '元' },
    },
    {
      id: 'heat',
      kind: 'chart',
      layout: { x: 4, y: 6, w: 8, h: 3 },
      dataset: 'sales',
      query: { dimensions: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }], measures: [amount] },
      chart: { type: 'heatmap', variant: 'matrix', rowField: 'region', columnField: 'product', valueField: 'amount' },
    },
  ],
  links: [
    { id: 'region', card: 'byRegion', dimension: 'region', targets: [{ card: 'byProduct', field: 'region' }, { card: 'total', field: 'region' }] },
    { id: 'product', card: 'heat', dimension: 'product', targets: [{ card: 'total', field: 'product' }] },
  ],
}

beforeAll(() => {
  defineXhElements()
  defineReportViewer()
})

afterEach(() => {
  document.body.replaceChildren()
})

function filterRows(request: DatasetRequest): DatasetData {
  const conditions = request.filter?.conditions ?? []
  const keep = rows.filter(row => conditions.every((node) => {
    if ('conditions' in node)
      return true
    const values = node.value as readonly unknown[]
    return node.operator !== 'in' || values.includes(row[node.field as keyof typeof row])
  }))
  return { kind: 'rows', rows: keep }
}

async function mount(requests: DatasetRequest[] = []): Promise<XhReportViewer> {
  const viewer = document.createElement('xh-report-viewer') as XhReportViewer
  viewer.timeZone = 'UTC'
  viewer.dataProvider = async (request) => {
    requests.push(request)
    return filterRows(request)
  }
  viewer.schema = { schemaVersion: 1, id: 'demo', datasets: [dataset], body: dashboard } as ReportDocument
  document.body.append(viewer)
  await viewer.refresh()
  return viewer
}

function card(viewer: XhReportViewer, id: string): HTMLElement {
  return viewer.querySelector(`[data-part="card"][data-card="${id}"]`)!
}

function press(chart: Element, detail: Record<string, unknown>): void {
  chart.dispatchEvent(new CustomEvent('datum-press', { detail, bubbles: true, composed: true }))
}

async function settle(viewer: XhReportViewer): Promise<void> {
  for (let i = 0; i < 5 && viewer.loading; i++)
    await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('<xh-report-viewer>：看板', () => {
  it('卡片按网格位置排，图表卡片排成 UI 图表元素并写好数据', async () => {
    const viewer = await mount()
    expect(viewer.dataset.state).toBe('ready')
    const byRegion = card(viewer, 'byRegion')
    expect(byRegion.style.getPropertyValue('--xh-report-w')).toBe('6')
    expect(byRegion.querySelector('[data-part="card-title"]')!.textContent).toBe('各区域')
    const pie = byRegion.querySelector('xh-pie-chart') as HTMLElement & { data: unknown[], nameField: string }
    expect(pie.nameField).toBe('region')
    expect(pie.data).toEqual([{ region: 'East', amount: 150 }, { region: 'West', amount: 80 }])
    const bar = card(viewer, 'byProduct').querySelector('xh-cartesian-chart') as HTMLElement & { series: unknown[] }
    expect(bar.series).toEqual([{ mark: 'bar', x: 'product', id: 's', name: '金额', y: 'amount' }])
  })

  it('图表的可及名取卡片标题，没有标题时取度量标题', async () => {
    const viewer = await mount()
    expect(card(viewer, 'byRegion').querySelector('xh-pie-chart [data-xh-part="root"]')!.getAttribute('aria-label')).toBe('各区域')
    expect(card(viewer, 'byProduct').querySelector('xh-cartesian-chart [data-xh-part="root"]')!.getAttribute('aria-label')).toBe('金额')
  })

  it('指标卡片写成 xh-statistic，矩阵热力图写成 xh-heatmap 的行、列与格子', async () => {
    const viewer = await mount()
    const statistic = card(viewer, 'total').querySelector('xh-statistic')!
    expect(statistic.querySelector('[data-xh-part="value"]')!.textContent).toBe('230')
    expect(statistic.querySelector('[data-xh-part="suffix"]')!.textContent).toBe('元')
    const heat = card(viewer, 'heat').querySelector('xh-heatmap') as HTMLElement & { variant: string, rows: { label: string }[], columns: { label: string }[], value: unknown[] }
    expect(heat.variant).toBe('matrix')
    expect(heat.rows.map(row => row.label)).toEqual(['East', 'West'])
    expect(heat.columns.map(column => column.label)).toEqual(['A', 'B'])
    expect(heat.value).toHaveLength(3)
    expect(heat.querySelector('[data-xh-part="root"]')!.getAttribute('aria-label')).toBe('金额')
  })

  it('矩阵热力图作联动源：点一格按行或列维度发出取值，不写 activeKey', async () => {
    const viewer = await mount()
    const changes: unknown[] = []
    viewer.addEventListener('selections-change', event => changes.push((event as CustomEvent).detail.value))
    const heat = card(viewer, 'heat').querySelector('xh-heatmap') as HTMLElement & { rows: { value: string }[], columns: { value: string, label: string }[], activeKey?: unknown }
    const column = heat.columns.find(item => item.label === 'B')!.value
    press(heat, { key: `${heat.rows[0]!.value}|${column}`, date: '', row: heat.rows[0]!.value, column })
    await settle(viewer)
    expect(changes).toEqual([{ product: ['B'] }])
    expect(card(viewer, 'total').querySelector('[data-xh-part="value"]')!.textContent).toBe('50')
    expect((card(viewer, 'heat').querySelector('xh-heatmap') as HTMLElement & { activeKey?: unknown }).activeKey).toBeUndefined()
  })

  it('表格卡片作联动源：点一行按联动的维度发出取值，转发 action；再点一次取消', async () => {
    const viewer = document.createElement('xh-report-viewer') as XhReportViewer
    viewer.timeZone = 'UTC'
    viewer.dataProvider = async request => filterRows(request)
    viewer.schema = {
      schemaVersion: 1,
      id: 'list',
      datasets: [dataset],
      body: {
        type: 'dashboard',
        grid: { columns: 12, rowHeight: 40 },
        cards: [
          { id: 'list', kind: 'table', layout: { x: 0, y: 0, w: 8, h: 6 }, view: { type: 'table', dataset: 'sales', columns: [{ id: 'region', field: 'region' }, { id: 'amount', field: 'amount' }] } },
          { id: 'sum', kind: 'metric', layout: { x: 8, y: 0, w: 4, h: 3 }, dataset: 'sales', query: { dimensions: [], measures: [amount] }, metric: { value: 'amount' } },
        ],
        links: [{ id: 'pick', card: 'list', dimension: 'region', targets: [{ card: 'sum', field: 'region' }] }],
      },
    } as ReportDocument
    document.body.append(viewer)
    await viewer.refresh()
    const actions: unknown[] = []
    const changes: unknown[] = []
    viewer.addEventListener('action', event => actions.push((event as CustomEvent).detail))
    viewer.addEventListener('selections-change', event => changes.push((event as CustomEvent).detail.value))
    const cell = (): HTMLElement => card(viewer, 'list').querySelector('[data-xh-part="row"][value="r2"] [data-xh-part="cell"][value="amount"]') as HTMLElement
    cell().click()
    await settle(viewer)
    expect(actions).toEqual([expect.objectContaining({ card: 'list', link: 'pick', value: 'West', kind: 'detail', column: 'amount' })])
    expect(changes).toEqual([{ pick: ['West'] }])
    expect(card(viewer, 'sum').querySelector('[data-xh-part="value"]')!.textContent).toBe('80')
    cell().click()
    await settle(viewer)
    expect(changes.at(-1)).toEqual({ pick: [] })
    expect(card(viewer, 'sum').querySelector('[data-xh-part="value"]')!.textContent).toBe('230')
  })

  it('日历热力图作联动源：按日期发出取值，选中的日期写回 activeKey；没写区间时取数据的起止日期', async () => {
    const viewer = document.createElement('xh-report-viewer') as XhReportViewer
    viewer.timeZone = 'UTC'
    const days = [{ day: '2026-01-02', amount: 10 }, { day: '2026-01-05', amount: 30 }]
    viewer.dataProvider = async (request) => {
      const condition = request.filter?.conditions.find(node => 'operator' in node && node.operator === 'in') as { value: readonly unknown[] } | undefined
      return { kind: 'rows', rows: condition ? days.filter(row => condition.value.includes(row.day)) : days }
    }
    viewer.schema = {
      schemaVersion: 1,
      id: 'days',
      datasets: [{ id: 'daily', fields: [{ name: 'day', type: 'date' }, { name: 'amount', type: 'number' }] }],
      body: {
        type: 'dashboard',
        grid: { columns: 12, rowHeight: 40 },
        cards: [
          { id: 'calendar', kind: 'chart', layout: { x: 0, y: 0, w: 12, h: 4 }, dataset: 'daily', query: { dimensions: [{ id: 'day', field: 'day' }], measures: [amount] }, chart: { type: 'heatmap', variant: 'calendar', dateField: 'day', valueField: 'amount' } },
          { id: 'sum', kind: 'metric', layout: { x: 0, y: 4, w: 4, h: 2 }, dataset: 'daily', query: { dimensions: [], measures: [amount] }, metric: { value: 'amount' } },
        ],
        links: [{ id: 'day', card: 'calendar', dimension: 'day', targets: [{ card: 'sum', field: 'day' }] }],
      },
    } as ReportDocument
    document.body.append(viewer)
    await viewer.refresh()
    const calendar = card(viewer, 'calendar').querySelector('xh-heatmap') as HTMLElement & { startDate: string, endDate: string, activeKey?: unknown }
    expect([calendar.startDate, calendar.endDate]).toEqual(['2026-01-02', '2026-01-05'])
    const changes: unknown[] = []
    viewer.addEventListener('selections-change', event => changes.push((event as CustomEvent).detail.value))
    press(calendar, { key: '2026-01-03', date: '2026-01-03', row: '', column: '' })
    await settle(viewer)
    expect(changes).toEqual([])
    expect(card(viewer, 'sum').querySelector('[data-xh-part="value"]')!.textContent).toBe('40')
    press(calendar, { key: '2026-01-05', date: '2026-01-05', row: '', column: '' })
    await settle(viewer)
    expect(card(viewer, 'sum').querySelector('[data-xh-part="value"]')!.textContent).toBe('30')
    expect(changes).toEqual([{ day: ['2026-01-05'] }])
    expect(calendar.activeKey).toBe('2026-01-05')
  })

  it('同一次刷新里请求相同的卡片只取一次数', async () => {
    const requests: DatasetRequest[] = []
    const viewer = await mount(requests)
    const twin = { ...dashboard.cards[0]!, id: 'twin', layout: { x: 0, y: 9, w: 6, h: 6 } }
    viewer.schema = { schemaVersion: 1, id: 'demo', datasets: [dataset], body: { ...dashboard, cards: [...dashboard.cards, twin] } } as ReportDocument
    await viewer.updateComplete
    requests.length = 0
    await viewer.refresh()
    expect(requests).toHaveLength(4)
    expect(card(viewer, 'twin').querySelector('xh-pie-chart')).not.toBeNull()
  })

  it('点按源图表：转发 datum-press、更新选中值、强调源图表，只重算目标卡片；再点一次取消', async () => {
    const requests: DatasetRequest[] = []
    const viewer = await mount(requests)
    const pressed: unknown[] = []
    const changes: unknown[] = []
    viewer.addEventListener('datum-press', event => pressed.push((event as CustomEvent).detail))
    viewer.addEventListener('selections-change', event => changes.push((event as CustomEvent).detail.value))
    const before = requests.length
    const pie = card(viewer, 'byRegion').querySelector('xh-pie-chart') as HTMLElement & { activeKey?: unknown }
    press(pie, { seriesId: 'pie', key: 'East', datum: { region: 'East', amount: 150 } })
    await settle(viewer)
    expect(pressed).toEqual([expect.objectContaining({ card: 'byRegion', link: 'region', value: 'East' })])
    expect(changes).toEqual([{ region: ['East'] }])
    expect(pie.activeKey).toBe('East')
    const reloaded = requests.slice(before)
    expect(reloaded).toHaveLength(2)
    expect(reloaded.every(request => JSON.stringify(request.filter).includes('East'))).toBe(true)
    const bar = card(viewer, 'byProduct').querySelector('xh-cartesian-chart') as HTMLElement & { data: unknown[] }
    expect(bar.data).toEqual([{ product: 'A', amount: 100 }, { product: 'B', amount: 50 }])
    expect(card(viewer, 'total').querySelector('[data-xh-part="value"]')!.textContent).toBe('150')

    press(card(viewer, 'byRegion').querySelector('xh-pie-chart')!, { seriesId: 'pie', key: 'East', datum: { region: 'East', amount: 150 } })
    await settle(viewer)
    expect(changes.at(-1)).toEqual({ region: [] })
    expect(card(viewer, 'total').querySelector('[data-xh-part="value"]')!.textContent).toBe('230')
  })

  it('受控的 selections 只派发事件，由宿主写回后才重算', async () => {
    const viewer = await mount()
    viewer.selections = {}
    await viewer.updateComplete
    const changes: unknown[] = []
    viewer.addEventListener('selections-change', event => changes.push((event as CustomEvent).detail.value))
    press(card(viewer, 'byRegion').querySelector('xh-pie-chart')!, { seriesId: 'pie', key: 'West', datum: { region: 'West', amount: 80 } })
    await settle(viewer)
    expect(changes).toEqual([{ region: ['West'] }])
    expect(card(viewer, 'total').querySelector('[data-xh-part="value"]')!.textContent).toBe('230')
    viewer.selections = { region: ['West'] }
    await viewer.updateComplete
    await settle(viewer)
    expect(card(viewer, 'total').querySelector('[data-xh-part="value"]')!.textContent).toBe('80')
  })

  it('取数失败的卡片显示错误并派发 load-error，其余卡片照常', async () => {
    const viewer = document.createElement('xh-report-viewer') as XhReportViewer
    viewer.timeZone = 'UTC'
    viewer.dataProvider = async (request) => {
      if (request.query?.dimensions.some(dimension => dimension.id === 'product') && request.query.dimensions.length === 1)
        throw new Error('down')
      return filterRows(request)
    }
    const errors: unknown[] = []
    viewer.addEventListener('load-error', event => errors.push((event as CustomEvent).detail.card))
    viewer.schema = { schemaVersion: 1, id: 'demo', datasets: [dataset], body: dashboard } as ReportDocument
    document.body.append(viewer)
    await viewer.refresh()
    expect(errors).toContain('byProduct')
    expect(card(viewer, 'byProduct').getAttribute('data-state')).toBe('error')
    expect(card(viewer, 'byRegion').getAttribute('data-state')).toBe('ready')
  })
})
