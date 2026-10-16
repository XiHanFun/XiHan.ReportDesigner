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
  links: [{ id: 'region', card: 'byRegion', dimension: 'region', targets: [{ card: 'byProduct', field: 'region' }, { card: 'total', field: 'region' }] }],
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

  it('指标卡片写成 xh-statistic，热力图卡片暂不支持', async () => {
    const viewer = await mount()
    const statistic = card(viewer, 'total').querySelector('xh-statistic')!
    expect(statistic.querySelector('[data-xh-part="value"]')!.textContent).toBe('230')
    expect(statistic.querySelector('[data-xh-part="suffix"]')!.textContent).toBe('元')
    const heat = card(viewer, 'heat')
    expect(heat.getAttribute('data-state')).toBe('unsupported')
    expect(heat.querySelector('[data-part="card-status"]')!.textContent).toBe('This view is not supported yet')
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
