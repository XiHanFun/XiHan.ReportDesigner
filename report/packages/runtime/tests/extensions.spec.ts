// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DatasetData, DatasetRequest, DatasetSchema, QueryResult, ReportDocument } from '@xihan-report/core'
import type { ReportDataProvider, ReportOverlayContext, ReportRuntimeExtension, ReportScene, XhReportViewer } from '../src'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createReportRuntimeModel, defineReportViewer, REPORT_RUNTIME_EXTENSION } from '../src'

const dataset: DatasetSchema = {
  id: 'sales',
  fields: [
    { name: 'region', type: 'string' },
    { name: 'amount', type: 'number' },
  ],
}

const rows = [
  { region: 'East', amount: 100 },
  { region: 'West', amount: 80 },
  { region: 'East', amount: 20 },
]

const lanes: ReportRuntimeExtension = {
  id: '@xihan-report-pro/lanes',
  cards: {
    'lanes.board': {
      data: 'query',
      compute: (_card, input) => (input.query as QueryResult).rows.map(row => String(row.region)),
    },
  },
  cardRenderers: {
    'lanes.board': (body, result) => {
      const list = document.createElement('ul')
      for (const lane of result.value as readonly string[]) {
        const item = document.createElement('li')
        item.textContent = lane
        list.append(item)
      }
      body.replaceChildren(list)
      return undefined
    },
  },
}

const notes: ReportRuntimeExtension = {
  id: '@acme/notes',
  views: { 'notes.page': { data: 'none', compute: view => (view as { text?: string }).text ?? '' } },
  viewRenderers: {
    'notes.page': (container, result) => {
      const paragraph = document.createElement('p')
      paragraph.textContent = String(result.value)
      container.replaceChildren(paragraph)
      return undefined
    },
  },
}

function dashboardSchema(): ReportDocument {
  return {
    schemaVersion: 1,
    id: 'lanes',
    datasets: [dataset],
    body: {
      type: 'dashboard',
      grid: { columns: 12, rowHeight: 40 },
      cards: [{
        id: 'board',
        kind: 'lanes.board',
        layout: { x: 0, y: 0, w: 6, h: 4 },
        dataset: 'sales',
        query: { dimensions: [{ id: 'region', field: 'region' }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] },
      }],
    },
  }
}

const provider: ReportDataProvider = async (): Promise<DatasetData> => ({ kind: 'rows', rows })

beforeAll(() => {
  defineReportViewer()
})

afterEach(() => {
  document.body.replaceChildren()
})

async function mount(schema: ReportDocument, extensions: readonly ReportRuntimeExtension[], dataProvider = provider): Promise<XhReportViewer> {
  const viewer = document.createElement('xh-report-viewer') as XhReportViewer
  viewer.timeZone = 'UTC'
  viewer.extensions = extensions
  viewer.dataProvider = dataProvider
  viewer.schema = schema
  document.body.append(viewer)
  await viewer.refresh()
  return viewer
}

describe('createReportRuntimeModel', () => {
  it('内置的三种卡片渲染与 xlsx 导出在最前', () => {
    const model = createReportRuntimeModel()
    expect([...model.cardRenderers.keys()]).toEqual(['chart', 'metric', 'table'])
    expect(model.exporters.map(exporter => exporter.id)).toEqual(REPORT_RUNTIME_EXTENSION.exporters!.map(exporter => exporter.id))
  })

  it('扩展登记的种类必须有渲染；给没登记的种类写渲染、两个扩展渲染同一种都会抛', () => {
    expect(() => createReportRuntimeModel([{ id: '@acme/x', cards: { 'x.card': { data: 'none' } } }])).toThrow(TypeError)
    expect(() => createReportRuntimeModel([{ id: '@acme/x', cardRenderers: { 'x.card': () => undefined } }])).toThrow(TypeError)
    expect(() => createReportRuntimeModel([lanes, { id: '@acme/again', cardRenderers: { 'lanes.board': () => undefined } }]))
      .toThrow(expect.objectContaining({ code: 'designer.extension-conflict', space: 'card-renderer' }))
  })

  it('取数中间件按扩展顺序一层层包在外面，后登记的在最外', async () => {
    const calls: string[] = []
    const wrap = (name: string): ReportRuntimeExtension => ({
      id: `@acme/${name}`,
      dataProvider: next => async (request, context) => {
        calls.push(`${name}:in`)
        const data = await next(request, context)
        calls.push(`${name}:out`)
        return data
      },
    })
    const model = createReportRuntimeModel([wrap('a'), wrap('b')])
    await model.provider(async () => {
      calls.push('host')
      return { kind: 'rows', rows: [] }
    })({ dataset: 'sales', parameters: {}, filter: null, sort: null, limit: null, query: null } as DatasetRequest, { signal: new AbortController().signal })
    expect(calls).toEqual(['b:in', 'a:in', 'host', 'a:out', 'b:out'])
  })
})

describe('xh-report-viewer：扩展', () => {
  it('扩展卡片按种类计算并交给它的渲染；getResults 给出卡片的值', async () => {
    const viewer = await mount(dashboardSchema(), [lanes])
    const items = [...viewer.querySelectorAll('[data-card="board"] li')].map(item => item.textContent)
    expect(items).toEqual(['East', 'West'])
    const results = viewer.getResults()
    expect(results.cards.map(entry => [entry.result.card.id, entry.result.value])).toEqual([['board', ['East', 'West']]])
    expect(results.body).toBeUndefined()
  })

  it('没装扩展时报 unknown-kind，不取数', async () => {
    const requests: DatasetRequest[] = []
    const viewer = await mount(dashboardSchema(), [], async (request) => {
      requests.push(request)
      return { kind: 'rows', rows }
    })
    expect(viewer.issues.map(issue => issue.code)).toEqual(['unknown-kind'])
    expect(requests).toEqual([])
  })

  it('主体可以是扩展视图：交给它的渲染', async () => {
    const viewer = await mount({ schemaVersion: 1, id: 'notes', datasets: [dataset], body: { type: 'notes.page', text: '本月目标' } }, [notes])
    expect(viewer.querySelector('[data-part="body"] p')?.textContent).toBe('本月目标')
    expect(viewer.getResults().body).toMatchObject({ value: '本月目标' })
  })

  it('export 交给登记了这种格式的导出器，上下文里有计算结果；没人认这种格式时抛 RangeError', async () => {
    const csv: ReportRuntimeExtension = {
      id: '@acme/csv',
      exporters: [{ id: '@acme/csv.csv', label: 'CSV', formats: ['csv'], export: async (_format, context) => context.results.cards.map(entry => entry.result.card.id).join(',') }],
    }
    const viewer = await mount(dashboardSchema(), [lanes, csv])
    await expect(viewer.export('csv')).resolves.toBe('board')
    await expect(viewer.export('pdf')).rejects.toThrow(RangeError)
  })

  it('extensions 冲突时赋值抛错，元素保持原来的扩展', async () => {
    const viewer = await mount(dashboardSchema(), [lanes])
    const before = viewer.extensions
    expect(() => {
      viewer.extensions = [lanes, { ...lanes }]
    }).toThrow(expect.objectContaining({ code: 'designer.extension-conflict' }))
    expect(viewer.extensions).toBe(before)
  })
})

describe('xh-report-viewer：叠加层', () => {
  function overlay(id: string, layer: 'below' | 'above', calls: { scene: ReportScene, context: ReportOverlayContext }[] = []): ReportRuntimeExtension {
    return {
      id: id.slice(0, id.lastIndexOf('.')),
      overlays: [{
        id,
        layer,
        render: (container, scene, context) => {
          calls.push({ scene, context })
          container.textContent = `${layer}:${scene.cards.map(card => `${card.card.id}=${card.status}`).join(',')}`
        },
      }],
    }
  }

  const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

  it('below 的容器排在卡片之前、above 的在之后，场景给出卡片的网格位置、状态与结果', async () => {
    const calls: { scene: ReportScene, context: ReportOverlayContext }[] = []
    const viewer = await mount(dashboardSchema(), [lanes, overlay('@acme/frame.border', 'below'), overlay('@acme/badge.corner', 'above', calls)])
    await settle()
    const grid = viewer.querySelector('[data-part="dashboard"]')!
    expect([...grid.children].map(child => (child as HTMLElement).dataset.overlay ?? (child as HTMLElement).dataset.card))
      .toEqual(['@acme/frame.border', 'board', '@acme/badge.corner'])
    expect(grid.lastElementChild?.getAttribute('data-layer')).toBe('above')
    expect(grid.lastElementChild?.textContent).toBe('above:board=ready')
    const last = calls.at(-1)!
    expect(last.context.mode).toBe('viewer')
    expect(last.scene.cards[0]).toMatchObject({ layout: { x: 0, y: 0, w: 6, h: 4 }, status: 'ready', result: { value: ['East', 'West'] } })
  })

  it('换掉扩展后撤下不再登记的叠加层，主体不是看板时不画', async () => {
    const viewer = await mount(dashboardSchema(), [lanes, overlay('@acme/badge.corner', 'above')])
    await settle()
    viewer.extensions = [lanes]
    await viewer.refresh()
    await settle()
    expect(viewer.querySelector('[data-part="overlay"]')).toBeNull()
    viewer.extensions = [notes, overlay('@acme/badge.corner', 'above')]
    viewer.schema = { schemaVersion: 1, id: 'notes', datasets: [dataset], body: { type: 'notes.page', text: '本月目标' } }
    await viewer.refresh()
    await settle()
    expect(viewer.querySelector('[data-part="overlay"]')).toBeNull()
  })

  it('两个扩展登记同一个叠加层 id 时合并报冲突', () => {
    expect(() => createReportRuntimeModel([overlay('@acme/badge.corner', 'above'), { ...overlay('@acme/badge.corner', 'below'), id: '@acme/other' }]))
      .toThrow(expect.objectContaining({ code: 'designer.extension-conflict', space: 'overlay' }))
  })
})
