// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView, DatasetRequest, ReportDocument } from '@xihan-report/core'
import type { XhSortableElement, XhTreeElement } from '@xihan-ui/web-components/define'
import type { XhReportDesigner } from '../src'
import { formatJsonPath } from '@xihan-ui/core/json'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineReportDesigner } from '../src'

function metric(id: string, x: number): DashboardView['cards'][number] {
  return {
    id,
    kind: 'metric',
    title: id,
    layout: { x, y: 0, w: 4, h: 2 },
    dataset: 'sales',
    query: { dimensions: [], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] },
    metric: { value: 'amount' },
  }
}

const board: ReportDocument = {
  schemaVersion: 1,
  id: 'board',
  datasets: [{ id: 'sales', fields: [{ name: 'region', type: 'string' }, { name: 'amount', type: 'number' }] }],
  body: {
    type: 'dashboard',
    grid: { columns: 12, rowHeight: 40 },
    cards: [
      {
        id: 'pie',
        kind: 'chart',
        title: '各区域',
        layout: { x: 0, y: 0, w: 4, h: 4 },
        dataset: 'sales',
        query: { dimensions: [{ id: 'region', field: 'region' }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] },
        chart: { type: 'pie', nameField: 'region', valueField: 'amount' },
      },
      metric('a', 4),
      metric('b', 8),
    ],
  },
}

// jsdom 不排版：属性面板里多行文本框自动增高要读的计算样式与内容高度给出浏览器里的缺省值
const STYLE_FALLBACK: Readonly<Record<string, string>> = {
  'writing-mode': 'horizontal-tb',
  'box-sizing': 'border-box',
  'max-block-size': 'none',
  'padding-top': '0px',
  'padding-bottom': '0px',
  'border-top-width': '0px',
  'border-bottom-width': '0px',
  'font-size': '14px',
  'line-height': '20px',
}

beforeAll(() => {
  defineReportDesigner()
  Element.prototype.scrollIntoView ??= function () {}
})

beforeEach(() => {
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => new Proxy(real(element, pseudo), {
    get(target, key) {
      if (key === 'getPropertyValue')
        return (name: string) => target.getPropertyValue(name) || STYLE_FALLBACK[name] || ''
      const value = Reflect.get(target, key) as unknown
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  }))
  vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(20)
})

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function events(element: HTMLElement, name: string): unknown[] {
  const seen: unknown[] = []
  element.addEventListener(name, event => seen.push((event as CustomEvent).detail))
  return seen
}

async function mount(options: { provider?: (request: DatasetRequest) => void } = {}): Promise<XhReportDesigner> {
  const designer = document.createElement('xh-report-designer')
  if (options.provider) {
    const record = options.provider
    designer.dataProvider = async (request) => {
      record(request)
      return { kind: 'rows', rows: [{ region: 'East', amount: 10 }, { region: 'West', amount: 5 }] }
    }
  }
  designer.schema = board
  document.body.append(designer)
  await designer.updateComplete
  return designer
}

function card(designer: XhReportDesigner, id: string): HTMLElement {
  return designer.querySelector(`[data-part="card"][data-card="${id}"]`)!
}

function press(target: Element, init: MouseEventInit = {}): void {
  target.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true, ...init }))
}

function key(designer: XhReportDesigner, keyName: string, init: KeyboardEventInit = {}): void {
  designer.querySelector('[data-part="canvas"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true, ...init }))
}

interface Box { x: number, y: number, width: number, height: number }

function stub(element: Element, { x, y, width, height }: Box): void {
  element.getBoundingClientRect = () => ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON: () => ({}) })
}

/** 画布原点在 (0, 0)，网格宽 1200、无间隙：一列 100、一行 40；卡片按定义的格坐标摆好。 */
function placeGrid(designer: XhReportDesigner): void {
  stub(designer.querySelector('[data-part="surface"]')!, { x: 0, y: 0, width: 1200, height: 800 })
  stub(designer.querySelector('[data-part="dashboard"]')!, { x: 0, y: 0, width: 1200, height: 800 })
  for (const item of cards(designer)) {
    const { x, y, w, h } = item.layout
    stub(card(designer, item.id), { x: x * 100, y: y * 40, width: w * 100, height: h * 40 })
  }
}

function cards(designer: XhReportDesigner): DashboardView['cards'] {
  return (designer.schema!.body as DashboardView).cards
}

function transform(designer: XhReportDesigner, phase: string, kind: string, id: string, rect: Box): void {
  designer.querySelector('xh-designer-transform')!.dispatchEvent(new CustomEvent('transform', { detail: { phase, kind, rects: new Map([[id, rect]]), guides: [] } }))
}

function well(designer: XhReportDesigner, list: string): HTMLElement {
  return designer.querySelector(`[data-part="well"][data-list="${list}"]`)!
}

/** 字段栏各列表的项标题。 */
function wellLabels(designer: XhReportDesigner): Record<string, string[]> {
  return Object.fromEntries([...designer.querySelectorAll<HTMLElement>('[data-part="well"]')].map(element => [
    element.dataset.list,
    [...element.querySelectorAll('[data-xh-part="item"]')].map(item => item.getAttribute('aria-label')!),
  ]))
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 300))
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('<xh-report-designer>：画布', () => {
  it('看板的卡片按网格排开；没给取数回调时画占位，写着卡片种类', async () => {
    const designer = await mount()
    await settle()
    expect([...designer.querySelectorAll('[data-part="card"]')].map(section => (section as HTMLElement).dataset.card)).toEqual(['pie', 'a', 'b'])
    expect(card(designer, 'pie').getAttribute('data-state')).toBe('placeholder')
    expect(card(designer, 'pie').querySelector('[data-part="placeholder"]')!.textContent).toContain('Pie chart')
    expect(designer.getAttribute('aria-label')).toBe('Report designer')
  })

  it('给了取数回调画真数据；只有取数请求变了的卡片才重新取数，位置与标题变了不取数', async () => {
    const requests: DatasetRequest[] = []
    const designer = await mount({ provider: request => requests.push(request) })
    await settle()
    expect(card(designer, 'pie').querySelector('xh-pie-chart')).not.toBeNull()
    expect(card(designer, 'a').querySelector('xh-statistic')).not.toBeNull()
    expect(requests).toHaveLength(2)

    const section = card(designer, 'b')
    designer.execute([{ type: 'layoutCards', layouts: { b: { x: 8, y: 2, w: 4, h: 2 } } }])
    await designer.updateComplete
    expect(card(designer, 'b')).toBe(section)
    expect(section.style.getPropertyValue('--xh-report-y')).toBe('3')
    designer.execute([{ type: 'updateCard', id: 'a', changes: [{ path: ['title'], value: '销售额' }] }])
    await settle()
    expect(requests).toHaveLength(2)
    expect(card(designer, 'a').querySelector('xh-statistic')).not.toBeNull()

    designer.execute([{ type: 'addItem', card: 'a', list: 'measures', item: { id: 'n', aggregate: 'count' } }])
    await settle()
    expect(requests).toHaveLength(3)
  })
})

describe('<xh-report-designer>：编辑', () => {
  it('点卡片选中，Shift 追加，点空白清空；选中的卡片交给覆盖层', async () => {
    const designer = await mount()
    const changes = events(designer, 'selection-change')
    press(card(designer, 'a'))
    press(card(designer, 'b'), { shiftKey: true })
    expect(designer.getSelection()).toEqual({ cards: ['a', 'b'] })
    expect(designer.querySelector('xh-designer-transform')!.items).toHaveLength(2)
    press(designer.querySelector('[data-part="surface"]')!)
    expect(designer.getSelection()).toEqual({ cards: [] })
    expect(changes).toHaveLength(3)
  })

  it('按 Delete 删除选中的卡片，Ctrl+Z 撤销；派发 schema-change 与 dirty-change', async () => {
    const designer = await mount()
    const schemaChanges = events(designer, 'schema-change') as { kind: string, operations: unknown[] }[]
    const dirty = events(designer, 'dirty-change')
    designer.select({ cards: ['a'] })
    key(designer, 'Delete')
    expect((designer.schema!.body as DashboardView).cards.map(item => item.id)).toEqual(['pie', 'b'])
    expect(schemaChanges.at(-1)).toMatchObject({ kind: 'execute', operations: [{ type: 'removeCard', id: 'a' }] })
    expect(designer.dirty).toBe(true)
    key(designer, 'z', { ctrlKey: true })
    expect(designer.schema).toEqual(board)
    expect(schemaChanges.at(-1)).toMatchObject({ kind: 'undo' })
    expect(dirty).toEqual([{ dirty: true }, { dirty: false }])
    expect(designer.canRedo).toBe(true)
  })

  it('方向键挪一格（压到的卡片让开），Shift 加方向键改大小；每次按键一步撤销', async () => {
    const designer = await mount()
    designer.select({ cards: ['a'] })
    key(designer, 'ArrowRight')
    expect((designer.schema!.body as DashboardView).cards[1]!.layout).toMatchObject({ x: 5 })
    key(designer, 'ArrowLeft', { shiftKey: true })
    expect((designer.schema!.body as DashboardView).cards[1]!.layout).toMatchObject({ w: 3 })
    designer.undo()
    designer.undo()
    expect(designer.schema).toEqual(board)
  })

  it('同时选中多张卡片时方向键不挪动', async () => {
    const designer = await mount()
    designer.select({ cards: ['a', 'b'] })
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    designer.querySelector('[data-part="canvas"]')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(designer.schema).toEqual(board)
  })

  it('覆盖层的移动手势换成格坐标写进文档，松手记一步撤销、报一次 schema-change', async () => {
    const designer = await mount()
    placeGrid(designer)
    const schemaChanges = events(designer, 'schema-change') as { kind: string, operations: { type: string }[] }[]
    transform(designer, 'start', 'move', 'a', { x: 400, y: 0, width: 400, height: 80 })
    transform(designer, 'move', 'move', 'a', { x: 30, y: 150, width: 400, height: 80 })
    transform(designer, 'move', 'move', 'a', { x: 10, y: 170, width: 400, height: 80 })
    expect(cards(designer).find(item => item.id === 'a')!.layout).toEqual({ x: 0, y: 4, w: 4, h: 2 })
    expect(schemaChanges).toEqual([])
    transform(designer, 'end', 'move', 'a', { x: 10, y: 170, width: 400, height: 80 })
    expect(schemaChanges).toHaveLength(1)
    expect(schemaChanges[0]!.operations.map(operation => operation.type)).toEqual(['layoutCards'])
    designer.undo()
    expect(designer.schema).toEqual(board)
  })

  it('改大小连同位置一起改，越出网格的部分剪掉；取消时回滚、不报 schema-change', async () => {
    const designer = await mount()
    placeGrid(designer)
    const schemaChanges = events(designer, 'schema-change')
    transform(designer, 'start', 'resize', 'b', { x: 800, y: 0, width: 400, height: 80 })
    transform(designer, 'move', 'resize', 'b', { x: 700, y: 0, width: 650, height: 160 })
    expect(cards(designer).find(item => item.id === 'b')!.layout).toEqual({ x: 7, y: 0, w: 5, h: 4 })
    transform(designer, 'cancel', 'resize', 'b', { x: 800, y: 0, width: 400, height: 80 })
    expect(designer.schema).toEqual(board)
    expect(schemaChanges).toEqual([])
    expect(designer.canUndo).toBe(false)
  })

  it('框选选中整个落在选框里的卡片，带修饰键时追加', async () => {
    const designer = await mount()
    placeGrid(designer)
    const overlay = designer.querySelector('xh-designer-transform')!
    const marquee = (rect: { x: number, y: number, width: number, height: number }, additive: boolean): void => {
      overlay.dispatchEvent(new CustomEvent('marquee', { detail: { phase: 'end', rect, mode: 'contain', additive } }))
    }
    marquee({ x: 350, y: -10, width: 900, height: 120 }, false)
    expect(designer.getSelection()).toEqual({ cards: ['a', 'b'] })
    marquee({ x: -10, y: -10, width: 420, height: 200 }, true)
    expect(designer.getSelection()).toEqual({ cards: ['a', 'b', 'pie'] })
    marquee({ x: -10, y: -10, width: 420, height: 200 }, false)
    expect(designer.getSelection()).toEqual({ cards: ['pie'] })
  })

  it('物料面板放在外框的物料区，按图表、指标、表格分组列出卡片种类；panels 不含它时收起', async () => {
    const designer = await mount()
    const palette = designer.querySelector('xh-designer-palette')!
    expect(palette.closest('[data-region="palette"]')).not.toBeNull()
    expect(palette.groups!.map(group => [group.label, group.items.length])).toEqual([['Charts', 7], ['Metrics', 1], ['Tables', 3]])
    expect(palette.groups![0]!.items[1]).toMatchObject({ id: 'chart.pie', label: 'Pie chart', payload: 'chart.pie' })
    designer.panels = 'properties'
    await designer.updateComplete
    expect(palette.isConnected).toBe(false)
    expect(designer.querySelector('[data-region="canvas"] [data-part="canvas"]')).not.toBeNull()
  })

  it('点物料把新卡片放到第一个空位并选中它，记一步撤销；只读时物料只能浏览', async () => {
    const designer = await mount()
    const palette = designer.querySelector('xh-designer-palette')!
    const schemaChanges = events(designer, 'schema-change') as { operations: { type: string }[] }[]
    palette.dispatchEvent(new CustomEvent('item-activate', { detail: { id: 'chart.pie', payload: 'chart.pie' } }))
    const added = cards(designer).at(-1)!
    expect(added).toMatchObject({ id: 'chart1', kind: 'chart', dataset: 'sales', chart: { type: 'pie' }, layout: { x: 4, y: 2, w: 6, h: 8 } })
    expect(designer.getSelection()).toEqual({ cards: ['chart1'] })
    expect(schemaChanges.map(change => change.operations[0]!.type)).toEqual(['addCard'])
    designer.undo()
    expect(designer.schema).toEqual(board)
    designer.readonly = true
    await designer.updateComplete
    expect(palette.readonly).toBe(true)
    palette.dispatchEvent(new CustomEvent('item-activate', { detail: { id: 'metric', payload: 'metric' } }))
    expect(designer.schema).toEqual(board)
  })

  it('数据面板列出数据集与字段，点字段选中它；选择变了树随之同步，没有报表参数时参数树收起', async () => {
    const designer = await mount()
    const data = designer.querySelector('[data-part="data"]')!
    expect(data.closest('[data-region="data"]')).not.toBeNull()
    const tree = data.querySelector<XhTreeElement>('xh-tree[data-part="datasets"]')!
    expect(tree.collection).toEqual([{ value: '["dataset","sales"]', label: 'sales', children: [
      { value: '["field","sales","region"]', label: 'region' },
      { value: '["field","sales","amount"]', label: 'amount' },
    ] }])
    expect([...tree.querySelectorAll('[data-xh-part="item"] [data-xh-part="item-suffix"]')].map(item => item.textContent)).toEqual(['string', 'number'])
    expect(data.querySelector<HTMLElement>('xh-tree[data-part="parameters"]')!.hidden).toBe(true)
    tree.dispatchEvent(new CustomEvent('selection-change', { detail: { value: ['["field","sales","amount"]'] } }))
    expect(designer.getSelection()).toEqual({ cards: [], data: { kind: 'field', dataset: 'sales', name: 'amount' } })
    expect(tree.selection).toEqual(['["field","sales","amount"]'])
    designer.select({ cards: ['a'] })
    expect(tree.selection).toEqual([])
  })

  it('字段栏：看板上没有唯一选中的卡片时显示提示；选中卡片后列出它的维度与度量，标题取字段', async () => {
    const designer = await mount()
    const wells = designer.querySelector<HTMLElement>('[data-part="wells"]')!
    expect(wells.closest('[data-region="wells"]')).not.toBeNull()
    expect(wells.querySelector<HTMLElement>('[data-part="wells-hint"]')!.hidden).toBe(false)
    designer.select({ cards: ['pie'] })
    await designer.updateComplete
    expect(wellLabels(designer)).toEqual({ dimensions: ['region'], measures: ['amount'] })
    expect(wells.querySelector<HTMLElement>('[data-part="wells-hint"]')!.hidden).toBe(true)
  })

  it('字段栏里拖动排序、移除与点选列表项；移除走 planRemoveItem，记一步撤销', async () => {
    const designer = await mount()
    designer.select({ cards: ['pie'] })
    designer.execute([{ type: 'addItem', card: 'pie', list: 'measures', item: { id: 'n', aggregate: 'count', title: '单数' } }])
    await designer.updateComplete
    expect(wellLabels(designer).measures).toEqual(['amount', '单数'])
    well(designer, 'measures').querySelector<XhSortableElement>('xh-sortable')!.dispatchEvent(new CustomEvent('sort', { detail: { id: 'n', from: 1, to: 0, ids: ['n', 'amount'] } }))
    await designer.updateComplete
    expect(wellLabels(designer).measures).toEqual(['单数', 'amount'])
    well(designer, 'measures').querySelector<HTMLElement>('[item-id="amount"]')!.click()
    expect(designer.getSelection()).toEqual({ cards: ['pie'], item: { card: 'pie', list: 'measures', id: 'amount' } })
    well(designer, 'measures').querySelector('[item-id="n"] xh-tag')!.dispatchEvent(new CustomEvent('open-change', { detail: { open: false } }))
    await designer.updateComplete
    expect(wellLabels(designer).measures).toEqual(['amount'])
    designer.undo()
    await designer.updateComplete
    expect(wellLabels(designer).measures).toEqual(['单数', 'amount'])
  })

  it('移除图表正在用的度量后，绑定换到剩下的度量上，同一步撤销', async () => {
    const designer = await mount()
    designer.select({ cards: ['pie'] })
    designer.execute([{ type: 'addItem', card: 'pie', list: 'measures', item: { id: 'n', aggregate: 'count' } }])
    await designer.updateComplete
    well(designer, 'measures').querySelector('[item-id="amount"] xh-tag')!.dispatchEvent(new CustomEvent('open-change', { detail: { open: false } }))
    expect(cards(designer)[0]).toMatchObject({ query: { measures: [{ id: 'n' }] }, chart: { valueField: 'n' } })
    designer.undo()
    expect(cards(designer)[0]).toMatchObject({ chart: { valueField: 'amount' } })
  })

  it('交叉表的行与列同组，在两者之间拖动即透视；只读时不能移除与拖动', async () => {
    const designer = await mount()
    designer.schema = { ...board, body: { type: 'crosstab', dataset: 'sales', rows: [{ id: 'region', field: 'region' }], columns: [], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] } }
    await designer.updateComplete
    expect(wellLabels(designer)).toEqual({ rows: ['region'], columns: [], measures: ['amount'] })
    const rows = well(designer, 'rows').querySelector<XhSortableElement>('xh-sortable')!
    expect([rows.group, well(designer, 'columns').querySelector<XhSortableElement>('xh-sortable')!.group, well(designer, 'measures').querySelector<XhSortableElement>('xh-sortable')!.group]).toEqual(['pivot', 'pivot', undefined])
    rows.dispatchEvent(new CustomEvent('transfer', { detail: { id: 'region', fromList: 'rows', toList: 'columns', from: 0, to: 0, fromIds: [], toIds: ['region'] } }))
    await designer.updateComplete
    expect(wellLabels(designer)).toEqual({ rows: [], columns: ['region'], measures: ['amount'] })
    designer.readonly = true
    await designer.updateComplete
    expect(well(designer, 'columns').querySelector('xh-tag')!.hasAttribute('closable')).toBe(false)
    expect(well(designer, 'columns').querySelector<XhSortableElement>('xh-sortable')!.disabled).toBe(true)
  })

  it('属性面板：没有选中时编辑报表与看板网格，选中卡片时编辑卡片与图表配置，引用类的取值是带候选项的 select', async () => {
    const designer = await mount()
    const panel = designer.querySelector('xh-designer-properties')!
    expect(panel.closest('[data-region="properties"]')).not.toBeNull()
    expect(panel.targets!.map(target => [target.kind, target.id])).toEqual([['document', 'board']])
    expect(panel.targets![0]!.descriptors.map(descriptor => formatJsonPath(descriptor.path))).toEqual(['title', 'description', 'body.grid.columns', 'body.grid.rowHeight'])
    expect(panel.heading).toBe('Report · board')
    designer.select({ cards: ['pie'] })
    await designer.updateComplete
    const descriptors = panel.targets![0]!.descriptors
    expect(descriptors.find(descriptor => formatJsonPath(descriptor.path) === 'chart.nameField')!.control).toEqual({ kind: 'select', options: [{ value: 'region', label: 'region' }] })
    expect(descriptors.find(descriptor => formatJsonPath(descriptor.path) === 'dataset')!.control).toEqual({ kind: 'select', options: [{ value: 'sales', label: 'sales' }] })
    expect(panel.labelOf!(descriptors.find(descriptor => formatJsonPath(descriptor.path) === 'chart.nameField')!)).toBe('nameField')
  })

  it('属性写入换成操作：同一合并键的连续输入并成一步，property-commit 之后另起一步；多选时每个对象一条，合为一步', async () => {
    const designer = await mount()
    const panel = designer.querySelector('xh-designer-properties')!
    const change = (path: (string | number)[], value: unknown, targets: { kind: string, id: string }[]): void => {
      panel.dispatchEvent(new CustomEvent('property-change', { detail: { path, value, targets, merge: `m:${path.join('.')}` } }))
    }
    designer.select({ cards: ['pie'] })
    await designer.updateComplete
    change(['title'], '区', [{ kind: 'card', id: 'pie' }])
    change(['title'], '区域', [{ kind: 'card', id: 'pie' }])
    change(['chart', 'variant'], 'donut', [{ kind: 'card', id: 'pie' }])
    expect(cards(designer)[0]).toMatchObject({ title: '区域', chart: { variant: 'donut' } })
    panel.dispatchEvent(new CustomEvent('property-commit', { detail: { path: ['chart', 'variant'] } }))
    change(['chart', 'variant'], 'pie', [{ kind: 'card', id: 'pie' }])
    designer.undo()
    expect(cards(designer)[0]).toMatchObject({ chart: { variant: 'donut' } })
    designer.undo()
    designer.undo()
    expect(designer.schema).toEqual(board)
    designer.select({ cards: ['a', 'b'] })
    await designer.updateComplete
    expect(panel.heading).toBe('2 selected')
    change(['title'], '指标', [{ kind: 'card', id: 'a' }, { kind: 'card', id: 'b' }])
    expect(cards(designer).slice(1).map(item => item.title)).toEqual(['指标', '指标'])
    designer.undo()
    expect(designer.schema).toEqual(board)
  })

  it('列表项与数据面板字段的属性：项写 updateItem；字段不显示名字，datasetEditing 为 none 时只读；校验问题落到字段上', async () => {
    const designer = await mount()
    const panel = designer.querySelector('xh-designer-properties')!
    designer.select({ cards: ['pie'], item: { card: 'pie', list: 'measures', id: 'amount' } })
    await designer.updateComplete
    expect(panel.targets!.map(target => target.kind)).toEqual(['measure'])
    panel.dispatchEvent(new CustomEvent('property-change', { detail: { path: ['aggregate'], value: 'avg', targets: [{ kind: 'measure', id: 'amount' }], merge: 'x' } }))
    expect(cards(designer)[0]).toMatchObject({ query: { measures: [{ id: 'amount', aggregate: 'avg' }] } })
    designer.select({ data: { kind: 'field', dataset: 'sales', name: 'region' } })
    await designer.updateComplete
    expect(panel.targets![0]!.descriptors.map(descriptor => formatJsonPath(descriptor.path))).toEqual(['type', 'title', 'formula'])
    expect(panel.readonly).toBe(false)
    designer.datasetEditing = 'none'
    await designer.updateComplete
    expect(panel.readonly).toBe(true)
    designer.select({ cards: ['pie'] })
    designer.execute([{ type: 'updateCard', id: 'pie', changes: [{ path: ['chart', 'nameField'], value: 'ghost' }] }])
    await designer.updateComplete
    expect(panel.errors).toContainEqual(expect.objectContaining({ target: { kind: 'card', id: 'pie' }, path: ['chart', 'nameField'] }))
  })

  it('报表参数的缺省值用查看器参数栏的控件编辑，改动写 updateParameter 并结束这次编辑', async () => {
    const designer = await mount()
    designer.schema = { ...board, parameters: [{ name: 'region', type: 'string', options: [{ value: 'East' }, { value: 'West' }] }] }
    await designer.updateComplete
    designer.select({ data: { kind: 'parameter', name: 'region' } })
    await designer.updateComplete
    const select = designer.querySelector('xh-designer-properties [data-path="defaultValue"] [data-part="parameter-value"] xh-select')!
    expect(select).not.toBeNull()
    select.dispatchEvent(new CustomEvent('value-change', { detail: { value: ['o1'] } }))
    expect(designer.schema!.parameters).toEqual([{ name: 'region', type: 'string', options: [{ value: 'East' }, { value: 'West' }], defaultValue: 'West' }])
    expect(designer.canUndo).toBe(true)
  })

  it('赋新的 schema 装载并派发 load，赋回当前文档不重新装载', async () => {
    const designer = await mount()
    const schemaChanges = events(designer, 'schema-change') as { kind: string }[]
    designer.select({ cards: ['a'] })
    const current = designer.schema!
    designer.schema = current
    await designer.updateComplete
    expect(designer.getSelection()).toEqual({ cards: ['a'] })
    designer.schema = { ...board, title: '新报表' }
    await designer.updateComplete
    expect(schemaChanges).toEqual([expect.objectContaining({ kind: 'load' })])
    expect(designer.getSelection()).toEqual({ cards: [] })
    expect(designer.canUndo).toBe(false)
  })

  it('复制、粘贴与再制；只读时不改文档', async () => {
    const designer = await mount()
    expect(designer.canPaste).toBe(false)
    designer.select({ cards: ['a'] })
    expect(designer.copy()).toMatchObject({ cards: [{ id: 'a' }] })
    expect(designer.canPaste).toBe(true)
    expect(designer.paste()).toEqual({ cards: ['card1'] })
    expect(designer.duplicate()).toEqual({ cards: ['card2'] })
    designer.readonly = true
    await designer.updateComplete
    expect(designer.paste()).toEqual({ cards: [] })
    expect(designer.deleteSelection()).toBe(false)
    expect(designer.canUndo).toBe(false)
  })

  it('改出问题时派发 issues-change，validate 返回当前问题', async () => {
    const designer = await mount()
    const issues = events(designer, 'issues-change') as { issues: { code: string }[] }[]
    expect(designer.validate()).toEqual([])
    designer.execute([{ type: 'updateCard', id: 'pie', changes: [{ path: ['chart', 'nameField'], value: 'ghost' }] }])
    expect(issues.at(-1)!.issues.map(issue => issue.code)).toContain('unknown-dimension')
    expect(designer.validate().map(issue => issue.code)).toContain('unknown-dimension')
  })

  it('版式交给外框：panels 原样转交，画布总是显示；右键事件可以取消', async () => {
    const designer = await mount()
    const frame = designer.querySelector('xh-designer-frame')!
    expect(frame.querySelector('[data-part="region"][data-region="canvas"] [data-part="canvas"]')).not.toBeNull()
    designer.panels = ''
    await designer.updateComplete
    expect(frame.panels).toBe('')
    expect(frame.querySelector('[data-region="canvas"] [data-part="canvas"]')).not.toBeNull()
    designer.addEventListener('card-contextmenu', event => event.preventDefault())
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    card(designer, 'a').dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
    expect(designer.getSelection()).toEqual({ cards: ['a'] })
  })
})
