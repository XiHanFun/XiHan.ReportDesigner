import type { DashboardView, ExtensionCard, QueryResult, ReportCardKind, ReportCoreExtension, ReportDocument, ReportViewKind } from '../src'
import { describe, expect, it } from 'vitest'
import {
  applyOperations,
  cardDimension,
  chartData,
  computeCard,
  computeExtensionView,
  createReportModel,
  planRemoveField,
  planRenameField,
  REPORT_CORE_EXTENSION,
  ReportComputeError,
  runQuery,
  validateDocument,
} from '../src'
import { dashboardDocument } from './documents'
import { salesData, salesDataset } from './fixtures'

const timeline: ReportCardKind<ExtensionCard, { readonly rows: number }> = {
  data: 'query',
  validate: (card, check) => card.lane === undefined || check.dimensions.has(card.lane as string)
    ? []
    : [{ code: 'gantt.unknown-lane', path: [...check.path, 'lane'] }],
  compute: (_card, input) => ({ rows: input.query!.rows.length }),
}

const gantt: ReportCoreExtension = {
  id: '@xihan-report-pro/gantt',
  cards: { 'gantt.timeline': timeline },
}

const note: ReportViewKind = { data: 'none' }

function withCards(cards: readonly unknown[]): ReportDocument {
  const body = dashboardDocument.body as DashboardView
  return { ...dashboardDocument, body: { ...body, cards: cards as DashboardView['cards'], links: [] } }
}

const timelineCard = {
  id: 'plan',
  kind: 'gantt.timeline',
  layout: { x: 0, y: 20, w: 6, h: 4 },
  dataset: 'sales',
  query: { dimensions: [{ id: 'region', field: 'region' }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] },
  lane: 'region',
}

describe('createReportModel', () => {
  it('内置扩展在最前：三种卡片与四种视图；同一个数组只合一次', () => {
    const extensions = [gantt]
    const model = createReportModel(extensions)
    expect(model.extensions[0]).toBe(REPORT_CORE_EXTENSION)
    expect([...model.cards.keys()]).toEqual(['chart', 'metric', 'table', 'gantt.timeline'])
    expect([...model.views.keys()]).toEqual(['table', 'group', 'crosstab', 'dashboard'])
    expect(model.cards.get('gantt.timeline')).toMatchObject({ owner: gantt.id, builtin: false })
    expect(createReportModel(extensions)).toBe(model)
  })

  it('扩展 id、种类名重名时抛 designer.extension-conflict', () => {
    expect(() => createReportModel([gantt, { ...gantt }])).toThrow(expect.objectContaining({ code: 'designer.extension-conflict', space: 'extension' }))
    const other: ReportCoreExtension = { id: '@acme/gantt', cards: { 'gantt.timeline': timeline } }
    expect(() => createReportModel([gantt, other])).toThrow(expect.objectContaining({ code: 'designer.extension-conflict', space: 'card-kind', key: 'gantt.timeline' }))
  })

  it('种类名要以扩展 id 的末段加点开头，chart.、table. 留给内置；扩展视图只能是 query 或 none 形状', () => {
    expect(() => createReportModel([{ id: '@acme/kpi', cards: { gauge: timeline } }])).toThrow(TypeError)
    expect(() => createReportModel([{ id: '@acme/chart', cards: { 'chart.gauge': timeline } }])).toThrow(TypeError)
    expect(() => createReportModel([{ id: '@acme/kpi', views: { 'kpi.page': { data: 'table' } } }])).toThrow(TypeError)
    expect(() => createReportModel([{ id: '@acme/kpi', views: { 'kpi.page': note } }])).not.toThrow()
  })

  it('追加的属性与内置同路径时抛，路径不同时按顺序追加；编辑方式不能与报表自己的重名', () => {
    expect(() => createReportModel([{ id: '@acme/x', properties: { 'card:chart': [{ path: ['title'], control: { kind: 'text' } }] } }]))
      .toThrow(expect.objectContaining({ code: 'designer.extension-conflict', space: 'property' }))
    expect(() => createReportModel([{ id: '@acme/x', documentProperties: [{ path: ['description'], control: { kind: 'text' } }] }]))
      .toThrow(expect.objectContaining({ space: 'document-property' }))
    const model = createReportModel([{ id: '@acme/x', properties: { 'card:chart': [{ path: ['extensions', '@acme/x', 'owner'], control: { kind: 'text' } }] } }])
    expect(model.properties('card:chart').map(descriptor => descriptor.path)).toEqual([['extensions', '@acme/x', 'owner']])
    expect(() => createReportModel([{ id: '@acme/x', controls: { field: {} } }])).toThrow(expect.objectContaining({ space: 'control', key: 'field' }))
  })
})

describe('validateDocument：种类与扩展', () => {
  it('没登记的卡片种类报 unknown-kind，别的卡片照常校验', () => {
    const issues = validateDocument(withCards([timelineCard]))
    expect(issues.map(issue => [issue.code, issue.path])).toEqual([['unknown-kind', ['body', 'cards', 0, 'kind']]])
  })

  it('扩展卡片的取数部分按登记的形状查，种类自己的字段交给它的 validate', () => {
    const extensions = [gantt]
    expect(validateDocument(withCards([timelineCard]), { extensions })).toEqual([])
    const broken = validateDocument(withCards([{ ...timelineCard, lane: 'nope', query: { ...timelineCard.query, dimensions: [{ id: 'region', field: 'missing' }] } }]), { extensions })
    expect(broken.map(issue => [issue.code, issue.path])).toEqual([
      ['unknown-field', ['body', 'cards', 0, 'query', 'dimensions', 0, 'field']],
      ['gantt.unknown-lane', ['body', 'cards', 0, 'lane']],
    ])
  })

  it('扩展种类的问题码不以扩展 id 末段加点开头时抛 TypeError', () => {
    const sloppy: ReportCoreExtension = { id: '@acme/kpi', cards: { 'kpi.dial': { data: 'none', validate: (_card, check) => [{ code: 'bad', path: check.path }] } } }
    expect(() => validateDocument(withCards([{ id: 'd', kind: 'kpi.dial', layout: { x: 0, y: 0, w: 2, h: 2 } }]), { extensions: [sloppy] })).toThrow(TypeError)
  })

  it('主体可以是扩展视图：没登记报 unknown-kind；登记了 none 形状不查取数', () => {
    const document: ReportDocument = { ...dashboardDocument, body: { type: 'kpi.notes', text: 'x' } }
    expect(validateDocument(document).map(issue => issue.code)).toEqual(['unknown-kind'])
    expect(validateDocument(document, { extensions: [{ id: '@acme/kpi', views: { 'kpi.notes': note } }] })).toEqual([])
  })

  it('扩展数据只查结构：不是对象、或某一块不是对象时报 invalid-type', () => {
    const document: ReportDocument = {
      ...dashboardDocument,
      extensions: { '@acme/x': { owner: 'a' } },
      datasets: dashboardDocument.datasets.map(dataset => ({ ...dataset, fields: dataset.fields.map((field, i) => i === 0 ? { ...field, extensions: 'oops' as never } : field) })),
    }
    expect(validateDocument(document).map(issue => [issue.code, issue.path])).toEqual([
      ['invalid-type', ['datasets', 0, 'fields', 0, 'extensions']],
    ])
    const nested = { ...dashboardDocument, extensions: { '@acme/x': 1 as never } }
    expect(validateDocument(nested).map(issue => [issue.code, issue.path])).toEqual([['invalid-type', ['extensions', '@acme/x']]])
  })

  it('扩展追加的属性按描述查：必填却没填报 required；规则的问题一起给出', () => {
    const owner: ReportCoreExtension = {
      id: '@acme/owner',
      documentProperties: [{ path: ['extensions', '@acme/owner', 'name'], control: { kind: 'text' }, required: true }],
      rules: [document => document.title === undefined ? [{ code: 'owner.untitled', path: ['title'] }] : []],
    }
    const issues = validateDocument({ ...dashboardDocument, title: undefined }, { extensions: [owner] })
    expect(issues.map(issue => [issue.code, issue.path])).toEqual([
      ['required', ['extensions', '@acme/owner', 'name']],
      ['owner.untitled', ['title']],
    ])
  })
})

describe('按种类计算', () => {
  it('query 形状的扩展卡片先跑查询，再交给种类的 compute', () => {
    const result = computeCard(timelineCard as ExtensionCard, salesDataset, salesData, { extensions: [gantt] })
    expect(result.value).toEqual({ rows: new Set(salesData.rows.map(row => row.region)).size })
  })

  it('没登记的种类抛 unknown-kind；none 形状的扩展视图不取数，值是 compute 的结果', () => {
    expect(() => computeCard(timelineCard as ExtensionCard, salesDataset, salesData)).toThrow(ReportComputeError)
    const extensions: ReportCoreExtension[] = [{ id: '@acme/kpi', views: { 'kpi.notes': { data: 'none', compute: view => (view as { text?: string }).text } } }]
    expect(computeExtensionView({ type: 'kpi.notes', text: 'hi' }, undefined, undefined, { extensions }).value).toBe('hi')
  })

  it('内置图表卡片的结果是 ChartData', () => {
    const share = (dashboardDocument.body as DashboardView).cards.find(card => card.id === 'share')!
    if (share.kind !== 'chart')
      throw new Error('share is a chart card')
    const result = computeCard(share, salesDataset, salesData)
    expect(result.value).toEqual(chartData(share.chart, share.query, runQuery(share.query, salesDataset, salesData)))
  })
})

describe('扩展卡片与编辑计划', () => {
  const document = withCards([timelineCard])

  it('联动维度、字段改名与删除都认 query 形状的扩展卡片', () => {
    expect(cardDimension(timelineCard as ExtensionCard, 'region')).toEqual({ id: 'region', field: 'region' })
    const renamed = applyOperations(document, planRenameField(document, 'sales', 'region', 'area')).document
    expect(((renamed.body as DashboardView).cards[0] as ExtensionCard).query!.dimensions[0]!.field).toBe('area')
    const removed = applyOperations(document, planRemoveField(document, 'sales', 'amount').operations).document
    expect(((removed.body as DashboardView).cards[0] as ExtensionCard).query!.measures).toEqual([])
  })

  it('增删列表项落在扩展卡片的 query 上', () => {
    const next = applyOperations(document, [{ type: 'addItem', card: 'plan', list: 'dimensions', item: { id: 'product', field: 'product' } }]).document
    expect(((next.body as DashboardView).cards[0] as ExtensionCard).query!.dimensions.map(item => item.id)).toEqual(['region', 'product'])
  })
})

describe('查询结果的类型', () => {
  it('compute 拿到的是查询结果', () => {
    let seen: QueryResult | undefined
    const probe: ReportCoreExtension = { id: '@acme/probe', cards: { 'probe.card': { data: 'query', compute: (_card, input) => (seen = input.query) } } }
    computeCard({ ...timelineCard, kind: 'probe.card' } as ExtensionCard, salesDataset, salesData, { extensions: [probe] })
    expect(seen?.rows.length).toBeGreaterThan(0)
  })
})
