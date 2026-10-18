// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView, DatasetRequest, ReportDocument } from '@xihan-report/core'
import type { XhReportViewer } from '@xihan-report/runtime'
import type { DesignerPaletteDragPayload } from '@xihan-ui/designer-shell'
import type { XhSortableElement, XhTreeElement } from '@xihan-ui/web-components/define'
import type { XhReportDesigner } from '../src'
import { DEFAULT_REPORT_DESIGNER_TRANSLATIONS } from '@xihan-report/runtime'
import { reportZhCN } from '@xihan-report/runtime/locale'
import { formatJsonPath } from '@xihan-ui/core/json'
import { startDrag } from '@xihan-ui/designer-shell'
import { setXhConfig } from '@xihan-ui/web-components'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineReportDesigner, REPORT_DESIGNER_HELP_URL } from '../src'

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
  vi.unstubAllGlobals()
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

/**
 * 画布原点在 (0, 0)，网格宽 1200、无间隙：实际尺寸下一列 100、一行 40；卡片按定义的格坐标摆好。
 * zoom 是画布的缩放倍数：屏幕上的位置与大小都乘以它。
 */
function placeGrid(designer: XhReportDesigner, zoom = 1): void {
  stub(designer.querySelector('[data-part="surface"]')!, { x: 0, y: 0, width: 1200 * zoom, height: 800 * zoom })
  stub(designer.querySelector('[data-part="dashboard"]')!, { x: 0, y: 0, width: 1200 * zoom, height: 800 * zoom })
  for (const item of cards(designer)) {
    const { x, y, w, h } = item.layout
    stub(card(designer, item.id), { x: x * 100 * zoom, y: y * 40 * zoom, width: w * 100 * zoom, height: h * 40 * zoom })
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

describe('<xh-report-designer>：画布上的表格', () => {
  it('主体视图的表格以报表标题命名，表格卡片以卡片标题命名', async () => {
    const designer = await mount({ provider: () => {} })
    designer.schema = { ...board, title: '区域明细', body: { type: 'table', dataset: 'sales', columns: [{ id: 'region', field: 'region' }] } }
    await settle()
    expect(designer.querySelector('[data-part="surface"] xh-table [data-xh-part="root"]')!.getAttribute('aria-label')).toBe('区域明细')
    designer.schema = { ...board, body: { type: 'dashboard', grid: { columns: 12, rowHeight: 40 }, cards: [{ id: 't', kind: 'table', title: '区域列表', layout: { x: 0, y: 0, w: 6, h: 4 }, view: { type: 'table', dataset: 'sales', columns: [{ id: 'region', field: 'region' }] } }] } }
    await settle()
    expect(designer.querySelector('[data-part="surface"] xh-table [data-xh-part="root"]')!.getAttribute('aria-label')).toBe('区域列表')
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

  it('readonly attribute 按三态读：没写可修改，写 "false" 也可修改，空串与别的写法只读，移除后回到可修改', async () => {
    const designer = await mount()
    const palette = designer.querySelector('xh-designer-palette')!
    const states: [string | null, boolean | undefined, boolean][] = [
      [null, undefined, false],
      ['false', false, false],
      ['', true, true],
      ['true', true, true],
      ['readonly', true, true],
      [null, undefined, false],
    ]
    for (const [attribute, property, readonly] of states) {
      if (attribute === null)
        designer.removeAttribute('readonly')
      else
        designer.setAttribute('readonly', attribute)
      await designer.updateComplete
      expect(designer.readonly, String(attribute)).toBe(property)
      expect(palette.readonly, String(attribute)).toBe(readonly)
    }
    designer.setAttribute('readonly', 'false')
    await designer.updateComplete
    const before = cards(designer).length
    palette.dispatchEvent(new CustomEvent('item-activate', { detail: { id: 'metric', payload: 'metric' } }))
    expect(cards(designer)).toHaveLength(before + 1)
  })

  it('数据集与报表参数各占一块卡片，树以卡片标题为名；点字段选中它，选择变了树随之同步；没有报表参数且不能新增时参数卡片收起', async () => {
    const designer = await mount()
    const data = designer.querySelector('[data-part="datasets"]')!
    expect(data.closest('[data-region="datasets"]')).not.toBeNull()
    expect(designer.querySelector('[data-part="parameters"]')!.closest('[data-region="parameters"]')).not.toBeNull()
    const tree = data.querySelector<XhTreeElement>('xh-tree[data-part="dataset-tree"]')!
    expect(tree.querySelector('[data-xh-part="tree"]')!.getAttribute('aria-label')).toBe('Datasets')
    expect(tree.collection).toEqual([{ value: '["dataset","sales"]', label: 'sales', children: [
      { value: '["field","sales","region"]', label: 'region' },
      { value: '["field","sales","amount"]', label: 'amount' },
    ] }])
    expect([...tree.querySelectorAll('[data-xh-part="item"] [data-xh-part="item-suffix"]')].map(item => item.textContent)).toEqual(['Text', 'Number'])
    const frame = designer.querySelector('xh-designer-frame')!
    expect(frame.panels).toBeUndefined()
    tree.dispatchEvent(new CustomEvent('selection-change', { detail: { value: ['["field","sales","amount"]'] } }))
    expect(designer.getSelection()).toEqual({ cards: [], data: { kind: 'field', dataset: 'sales', name: 'amount' } })
    expect(tree.selection).toEqual(['["field","sales","amount"]'])
    designer.select({ cards: ['a'] })
    expect(tree.selection).toEqual([])
    designer.readonly = true
    await designer.updateComplete
    expect(frame.panels!.split(' ')).not.toContain('parameters')
    expect(frame.panels!.split(' ')).toContain('datasets')
  })

  it('数据面板的新增按钮按 datasetEditing 显示：fields 只能加参数，full 还能加数据集与字段；新增后选中它', async () => {
    const designer = await mount()
    const button = (kind: string): HTMLElement => designer.querySelector(`[data-part="data-add"][data-kind="${kind}"]`)!
    expect(['dataset', 'field', 'parameter'].map(kind => button(kind).hidden)).toEqual([true, true, false])
    button('parameter').querySelector('button')!.click()
    expect(designer.schema!.parameters).toEqual([{ name: 'parameter1', type: 'string' }])
    expect(designer.getSelection()).toEqual({ cards: [], data: { kind: 'parameter', name: 'parameter1' } })
    designer.datasetEditing = 'full'
    designer.select({ data: { kind: 'dataset', dataset: 'sales' } })
    await designer.updateComplete
    expect(['dataset', 'field', 'parameter'].map(kind => button(kind).hidden)).toEqual([false, false, false])
    button('field').querySelector('button')!.click()
    expect(designer.schema!.datasets[0]!.fields.at(-1)).toEqual({ name: 'field1', type: 'string' })
    const tree = designer.querySelector<XhTreeElement>('[data-part="dataset-tree"]')!
    tree.expandedValue = []
    tree.dispatchEvent(new CustomEvent('expanded-value-change', { detail: { value: [] } }))
    designer.select({ data: { kind: 'field', dataset: 'sales', name: 'region' } })
    await designer.updateComplete
    expect(tree.expandedValue).toEqual(['["dataset","sales"]'])
    button('dataset').querySelector('button')!.click()
    await designer.updateComplete
    expect(tree.expandedValue).toEqual(['["dataset","sales"]', '["dataset","dataset1"]'])
    designer.readonly = true
    await designer.updateComplete
    expect(['dataset', 'field', 'parameter'].map(kind => button(kind).hidden)).toEqual([true, true, true])
  })

  it('删除数据面板对象：不涉及别处时直接删；会一并删掉别处时先弹确认框，确认后合为一步撤销；用着的数据集删不了', async () => {
    const designer = await mount()
    designer.datasetEditing = 'full'
    designer.execute([{ type: 'addParameter', parameter: { name: 'p', type: 'string' } }])
    designer.select({ data: { kind: 'parameter', name: 'p' } })
    expect(designer.deleteSelection()).toBe(true)
    expect(designer.schema!.parameters).toBeUndefined()
    designer.select({ data: { kind: 'field', dataset: 'sales', name: 'region' } })
    const before = designer.schema
    expect(designer.deleteSelection()).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(designer.schema).toBe(before)
    const dialog = document.querySelector<HTMLElement>('[data-scope="dialog"][data-part="content"][role="alertdialog"]')!
    expect(dialog.textContent).toContain('Delete "region"')
    expect(dialog.textContent).toContain('This also deletes 1 list item.')
    const ok = [...dialog.querySelectorAll<HTMLButtonElement>('[data-part="footer"] button')].find(button => button.textContent === 'Delete')!
    ok.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(designer.schema!.datasets[0]!.fields.some(field => field.name === 'region')).toBe(false)
    expect(cards(designer)[0]).toMatchObject({ query: { dimensions: [] } })
    designer.undo()
    expect(designer.schema).toEqual(before)
    designer.select({ data: { kind: 'dataset', dataset: 'sales' } })
    expect(designer.deleteSelection()).toBe(false)
    designer.datasetEditing = 'fields'
    designer.select({ data: { kind: 'dataset', dataset: 'sales' } })
    expect(designer.deleteSelection()).toBe(false)
  })

  it('改名在一次编辑结束时才做：级联到引用处、选中改了名的对象；名字重复时落一条错误', async () => {
    const designer = await mount()
    designer.datasetEditing = 'full'
    designer.select({ data: { kind: 'field', dataset: 'sales', name: 'region' } })
    await designer.updateComplete
    const panel = designer.querySelector('xh-designer-properties')!
    const change = (value: string): void => {
      panel.dispatchEvent(new CustomEvent('property-change', { detail: { path: ['name'], value, targets: [{ kind: 'field', id: 'region' }], merge: 'm' } }))
    }
    expect(panel.targets![0]!.descriptors.map(descriptor => formatJsonPath(descriptor.path))).toEqual(['name', 'type', 'title', 'formula'])
    change('amount')
    panel.dispatchEvent(new CustomEvent('property-commit', { detail: { path: ['name'] } }))
    await designer.updateComplete
    expect(panel.errors).toContainEqual({ target: { kind: 'field', id: 'region' }, path: ['name'], message: 'Duplicate name' })
    change('area')
    expect(designer.schema!.datasets[0]!.fields[0]!.name).toBe('region')
    panel.dispatchEvent(new CustomEvent('property-commit', { detail: { path: ['name'] } }))
    expect(designer.schema!.datasets[0]!.fields[0]!.name).toBe('area')
    expect(cards(designer)[0]).toMatchObject({ query: { dimensions: [{ field: 'area' }] } })
    expect(designer.getSelection()).toEqual({ cards: [], data: { kind: 'field', dataset: 'sales', name: 'area' } })
    designer.undo()
    expect(designer.schema).toEqual(board)
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
    // 筛选条件树用内建的 filter：字段取所在数据集，参数取报表参数，新节点带 id
    expect(descriptors.find(descriptor => formatJsonPath(descriptor.path) === 'query.filter')!.control).toEqual({
      kind: 'filter',
      ids: true,
      fields: [{ name: 'region', type: 'string' }, { name: 'amount', type: 'number' }],
      parameters: [],
    })
    expect(panel.labelOf!(descriptors.find(descriptor => formatJsonPath(descriptor.path) === 'chart.nameField')!)).toBe('Name dimension')
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

  it('取值是文字的报表参数，固定候选项用选项表逐行编辑，重复的取值标在那一格上；数值参数的候选项仍是 JSON', async () => {
    interface FieldArray extends HTMLElement {
      items: readonly { readonly key: string }[]
      readonly updateComplete: Promise<unknown>
    }
    const designer = await mount()
    designer.schema = { ...board, parameters: [
      { name: 'region', type: 'string', options: [{ value: 'East' }, { value: 'East', label: '东' }] },
      { name: 'year', type: 'number', options: [{ value: 2025 }] },
    ] }
    await designer.updateComplete
    designer.select({ data: { kind: 'parameter', name: 'region' } })
    await designer.updateComplete
    const array = designer.querySelector<FieldArray>('xh-designer-properties [data-path="options"] xh-field-array')!
    await array.updateComplete
    await array.updateComplete
    const cell = (index: number, column: string): HTMLElement & { errorText?: string } =>
      array.querySelector(`[slot="item-cell:${array.items[index]!.key}:${column}"]`)!
    expect(array.items).toHaveLength(2)
    expect([cell(0, 'value').errorText ?? '', cell(1, 'value').errorText]).toEqual(['', 'Duplicate option value'])
    cell(1, 'value').querySelector('xh-text-field')!.dispatchEvent(new CustomEvent('value-change', { detail: { value: 'West' } }))
    expect(designer.schema!.parameters![0]!.options).toEqual([{ value: 'East' }, { value: 'West', label: '东' }])
    designer.select({ data: { kind: 'parameter', name: 'year' } })
    await designer.updateComplete
    expect(designer.querySelector('xh-designer-properties [data-path="options"]')).not.toBeNull()
    expect(designer.querySelector('xh-designer-properties [data-path="options"] xh-field-array')).toBeNull()
  })

  it('问题列表放在画布下方，列出校验问题与所在卡片，错误、警告数在面板头里；点问题选中卡片', async () => {
    const designer = await mount()
    const issues = designer.querySelector('xh-designer-issues')!
    expect(issues.closest('[data-region="issues"]')).not.toBeNull()
    designer.execute([{ type: 'updateCard', id: 'pie', changes: [{ path: ['chart', 'nameField'], value: 'ghost' }] }])
    await designer.updateComplete
    expect(issues.items).toEqual([expect.objectContaining({ subject: '各区域', message: 'Unknown dimension "ghost"' })])
    const filter = designer.querySelector('[data-region="issues"] [data-part="panel-actions"] > [data-part="filter"]')!
    expect(filter).not.toBeNull()
    expect(issues.querySelector('[data-part="filter"]')).toBeNull()
    expect(filter.textContent).toContain('1')
    issues.dispatchEvent(new CustomEvent('issue-activate', { detail: { issue: issues.items![0]!.issue, index: 0 } }))
    expect(designer.getSelection()).toEqual({ cards: ['pie'] })
  })

  it('切到预览态：画布换成查看器，交给它当前的报表与取数回调，面板只留工具栏；切换时派发 mode-change', async () => {
    const designer = await mount()
    const modes = events(designer, 'mode-change')
    designer.mode = 'preview'
    await designer.updateComplete
    const viewer = designer.querySelector<XhReportViewer>('[data-part="preview"] xh-report-viewer')!
    expect(viewer.schema).toBe(designer.schema)
    expect(designer.querySelector<HTMLElement>('[data-part="canvas"]')!.hidden).toBe(true)
    expect(designer.querySelector('xh-designer-frame')!.panels).toBe('toolbar')
    expect(designer.querySelector('[data-region="palette"]')).toBeNull()
    designer.mode = 'preview'
    await designer.updateComplete
    designer.mode = 'design'
    await designer.updateComplete
    expect(designer.querySelector<HTMLElement>('[data-part="preview"]')!.hidden).toBe(true)
    expect(designer.querySelector('[data-region="palette"]')).not.toBeNull()
    expect(modes).toEqual([{ mode: 'preview' }, { mode: 'design' }])
  })

  it('数据集、报表参数、物料、字段栏、属性与问题画成卡片：面板头写标题与帮助，属性卡片的副标题是当前对象；三个零件 headless', async () => {
    const designer = await mount()
    const t = DEFAULT_REPORT_DESIGNER_TRANSLATIONS
    const title = (name: string): string | null | undefined => designer.querySelector(`[data-region="${name}"] [data-part="panel-title"]`)?.textContent
    const names = ['datasets', 'parameters', 'palette', 'wells', 'properties', 'issues']
    expect(names.map(title)).toEqual([t.datasets, t.parameters, t.palette, t.wells, t.properties, t.issues])
    const regions = designer.querySelector('xh-designer-frame')!.regions!
    expect(names.map(name => regions.find(region => region.name === name)?.help)).toEqual([t.datasetsHelp, t.parametersHelp, t.paletteHelp, t.wellsHelp, t.propertiesHelp, t.issuesHelp])
    expect(['xh-designer-palette', 'xh-designer-properties', 'xh-designer-issues'].map(tag => (designer.querySelector(tag) as HTMLElement & { headless?: boolean }).headless)).toEqual([true, true, true])
    designer.select({ cards: ['a'] })
    await designer.updateComplete
    const subtitle = designer.querySelector('[data-region="properties"] [data-part="panel-subtitle"]')!.textContent
    expect(subtitle).toBe((designer.querySelector('xh-designer-properties') as HTMLElement & { heading?: string }).heading)
    expect(subtitle).toContain('a')
  })

  it('点卡片头的关闭钮收起那块面板：设计器改写 panels 并派发 panels-change，外框的同名事件不冒出来；收起着的报表参数卡片照原样留在 panels 里', async () => {
    const designer = await mount()
    const seen = events(designer, 'panels-change')
    let fromFrame = 0
    document.addEventListener('panels-change', (event) => {
      if (event.target !== designer)
        fromFrame++
    })
    designer.querySelector<HTMLButtonElement>('[data-region="palette"] [data-part="panel-close"]')!.click()
    await designer.updateComplete
    expect(designer.panels!.split(' ')).not.toContain('palette')
    expect(designer.panels!.split(' ')).toContain('parameters')
    expect(seen).toEqual([{ panels: designer.panels }])
    expect(fromFrame).toBe(0)
    designer.readonly = true
    await designer.updateComplete
    expect(designer.querySelector('xh-designer-frame')!.panels!.split(' ')).not.toContain('parameters')
    designer.querySelector<HTMLButtonElement>('[data-region="issues"] [data-part="panel-close"]')!.click()
    await designer.updateComplete
    expect(designer.panels!.split(' ')).toEqual(expect.arrayContaining(['parameters', 'wells']))
    expect(designer.panels!.split(' ')).not.toContain('issues')
  })

  it('工具栏：按钮随选择与历史启用，点按钮执行命令，设计与预览两个按钮切换模式；只读时编辑类命令不可用', async () => {
    const designer = await mount()
    const button = (command: string): HTMLButtonElement => designer.querySelector(`[data-region="toolbar"] button[value="${command}"]`)!
    expect([...designer.querySelectorAll('[data-region="toolbar"] button[value]')].map(item => item.textContent)).toEqual(['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Duplicate', 'Delete', 'Zoom out', 'Zoom in', 'Zoom to fit', 'Actual size', 'Design', 'Preview', 'Panels', 'Settings', 'Help'])
    expect([button('undo').disabled, button('delete').disabled]).toEqual([true, true])
    designer.select({ cards: ['a'] })
    await designer.updateComplete
    expect(button('delete').disabled).toBe(false)
    button('delete').click()
    await designer.updateComplete
    expect(cards(designer).map(item => item.id)).toEqual(['pie', 'b'])
    button('undo').click()
    expect(designer.schema).toEqual(board)
    button('preview').click()
    await designer.updateComplete
    expect([designer.mode, button('preview').getAttribute('aria-pressed'), button('design').getAttribute('aria-pressed')]).toEqual(['preview', 'true', 'false'])
    expect(designer.querySelector('[data-region="toolbar"]')).not.toBeNull()
    button('design').click()
    designer.readonly = true
    designer.select({ cards: ['a'] })
    await designer.updateComplete
    expect([button('delete').disabled, button('copy').disabled, button('preview').disabled]).toEqual([true, false, false])
  })

  it('工具栏末组是 designer-shell 内置的面板、设置与帮助：设置打开设置对话框，帮助在新窗口打开文档站的设计器一页', async () => {
    const designer = await mount()
    const groups = Array.from(designer.querySelectorAll('[data-part="command-bar"] [data-xh-part="group"]'), group => Array.from(group.querySelectorAll('button'), button => button.value))
    expect(groups.at(-1)).toEqual(['panels', 'settings', 'help'])
    designer.querySelector<HTMLButtonElement>('[data-region="toolbar"] button[value="settings"]')!.click()
    await designer.updateComplete
    expect(designer.querySelector<HTMLElement & { open?: boolean }>('xh-designer-settings')!.open).toBe(true)
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    designer.querySelector<HTMLButtonElement>('[data-region="toolbar"] button[value="help"]')!.click()
    expect(open).toHaveBeenCalledWith(REPORT_DESIGNER_HELP_URL, '_blank', 'noopener,noreferrer')
  })

  it('顶栏中段是常用物料的插入钮：图标在上、物料名在下，点一下照点物料的做法新建并选中卡片；只读时不可用，commandLayout 的 header 写空就没有顶栏', async () => {
    const designer = await mount()
    const t = DEFAULT_REPORT_DESIGNER_TRANSLATIONS
    const shell = designer.querySelector('[data-region="header"] xh-tooltip[data-scope="designer-commands"]')!
    expect(shell.getAttribute('data-display')).toBe('stacked')
    const buttons = (): HTMLButtonElement[] => [...designer.querySelectorAll<HTMLButtonElement>('[data-region="header"] button[value]')]
    expect(buttons().map(button => button.value)).toEqual(['insert:chart.cartesian', 'insert:chart.pie', 'insert:metric', 'insert:table.table', 'insert:table.crosstab'])
    expect(buttons().map(button => button.getAttribute('aria-label'))).toEqual(['chart.cartesian', 'chart.pie', 'metric', 'table.table', 'table.crosstab'].map(type => t.insertCard(t.cardTypes[type]!)))
    expect(buttons()[2]!.querySelector('[data-part="label"]')!.textContent).toBe(t.cardTypes.metric)
    expect(buttons().every(button => button.hasAttribute('data-icon'))).toBe(true)
    const before = cards(designer).length
    buttons()[2]!.click()
    expect(cards(designer)).toHaveLength(before + 1)
    expect(designer.getSelection().cards).toEqual([cards(designer).at(-1)!.id])
    designer.readonly = true
    await designer.updateComplete
    expect(buttons().every(button => button.disabled)).toBe(true)
    designer.commandLayout = { header: [] }
    await designer.updateComplete
    expect(designer.querySelector('[data-region="header"] button[value]')).toBeNull()
  })

  it('「面板」点开一张锚在按钮上的菜单，列出能开关的六块卡片，勾选的显示；选中一项开关它并派发 panels-change', async () => {
    const designer = await mount()
    const frame = designer.querySelector<HTMLElement & { updateComplete: Promise<unknown> }>('xh-designer-frame')!
    await frame.updateComplete
    const button = designer.querySelector<HTMLButtonElement>('[data-region="toolbar"] button[value="panels"]')!
    expect(button.disabled).toBe(false)
    button.click()
    await designer.updateComplete
    type MenuHost = HTMLElement & { open?: boolean, anchor?: HTMLElement | null, collection?: readonly { value: string }[], checkboxValue?: readonly string[] }
    const menu = designer.querySelector<MenuHost>('[data-part="command-bar"] xh-menu')!
    const all = ['datasets', 'parameters', 'palette', 'issues', 'wells', 'properties'].map(name => `item:${name}`)
    expect([menu.open, menu.anchor]).toEqual([true, button])
    expect([...menu.collection!.map(item => item.value)].sort()).toEqual([...all].sort())
    expect([...menu.checkboxValue!].sort()).toEqual([...all].sort())
    const seen: string[] = []
    designer.addEventListener('panels-change', event => seen.push((event as CustomEvent<{ panels: string }>).detail.panels))
    menu.dispatchEvent(new CustomEvent('select', { detail: { value: 'item:wells' } }))
    await designer.updateComplete
    await frame.updateComplete
    expect(seen).toEqual([designer.panels])
    expect(designer.panels!.split(' ')).not.toContain('wells')
    expect(menu.checkboxValue).not.toContain('item:wells')
    menu.dispatchEvent(new CustomEvent('select', { detail: { value: 'item:wells' } }))
    await designer.updateComplete
    await frame.updateComplete
    expect(designer.panels!.split(' ')).toContain('wells')
  })

  it('状态栏左段：没选中时写数据集与卡片数，选中一张卡片写种类与所在的格，几张写已选中 N 个，选中数据面板的对象写属性卡片的那句', async () => {
    const designer = await mount()
    const t = DEFAULT_REPORT_DESIGNER_TRANSLATIONS
    const left = (): string | null => designer.querySelector('[data-region="status"] [data-zone="start"]')!.textContent
    expect(left()).toBe(`${t.objectKinds.document}${t.statusDocument(1, 3)}`)
    designer.select({ cards: ['a'] })
    await designer.updateComplete
    expect(left()).toBe(`${t.cardTypes.metric}${t.statusCell(5, 1, 4, 2)}`)
    designer.select({ cards: ['a', 'pie'] })
    await designer.updateComplete
    expect(left()).toBe(t.selected(2))
    designer.select({ data: { kind: 'field', dataset: 'sales', name: 'amount' } })
    await designer.updateComplete
    expect(left()).toBe((designer.querySelector('xh-designer-properties') as HTMLElement & { heading?: string }).heading)
  })

  it('状态栏右段是缩放倍数：缩放一变当场刷新，不等下一轮更新；点它回到实际大小', async () => {
    const designer = await mount()
    const t = DEFAULT_REPORT_DESIGNER_TRANSLATIONS
    const right = (): HTMLElement => designer.querySelector('[data-region="status"] [data-zone="end"]')!
    expect(right().textContent).toBe(`${t.statusZoom}100%`)
    designer.zoomIn()
    expect(right().textContent).toBe(`${t.statusZoom}120%`)
    designer.zoomOut()
    designer.zoomOut()
    expect(right().textContent).toBe(`${t.statusZoom}83%`)
    right().querySelector('button')!.click()
    expect([designer.getViewport().zoom, right().textContent]).toEqual([1, `${t.statusZoom}100%`])
    try {
      setXhConfig(reportZhCN)
      designer.requestUpdate()
      await designer.updateComplete
      expect(right().textContent).toBe('缩放100%')
    }
    finally {
      setXhConfig({})
    }
  })

  it('设置里关掉状态栏：外框不显示它；这时关掉一块卡片，panels 仍留着 status，再打开状态栏照样出现', async () => {
    const designer = await mount()
    const frame = designer.querySelector<HTMLElement & { panels?: string }>('xh-designer-frame')!
    designer.settings = { 'general.statusBar': false }
    await designer.updateComplete
    expect(frame.panels!.split(' ')).not.toContain('status')
    designer.querySelector<HTMLButtonElement>('[data-region="issues"] [data-part="panel-close"]')!.click()
    await designer.updateComplete
    expect(designer.panels!.split(' ')).toContain('status')
    designer.settings = {}
    await designer.updateComplete
    expect(frame.panels!.split(' ')).toContain('status')
    expect(frame.panels!.split(' ')).not.toContain('issues')
  })

  it('工具栏的容器部件叫 command-bar：设计器自己不再有 toolbar 部件，变换覆盖层的上下文工具条不会被它的样式连带命中', async () => {
    const designer = await mount()
    expect(designer.querySelector('[data-region="toolbar"] > [data-part="command-bar"]')).not.toBeNull()
    expect([...designer.querySelectorAll('[data-part="toolbar"]')].filter(node => !node.closest('xh-designer-transform'))).toEqual([])
  })

  it('工具栏缺省只显示图标：内置命令都带图标，名字与快捷键写在按钮上，删除按危险语气；共用命令的文案取 designer-shell 的命令文案', async () => {
    const designer = await mount()
    const buttons = (): HTMLButtonElement[] => [...designer.querySelectorAll<HTMLButtonElement>('[data-region="toolbar"] button[value]')]
    const button = (command: string): HTMLButtonElement => buttons().find(item => item.value === command)!
    expect(designer.querySelector('[data-region="toolbar"] [data-display]')!.getAttribute('data-display')).toBe('icon')
    expect(buttons().filter(item => !item.hasAttribute('data-icon')).map(item => item.value)).toEqual([])
    expect(buttons().filter(item => item.dataset.tone === 'danger').map(item => item.value)).toEqual(['delete'])
    expect([button('undo').getAttribute('aria-label'), button('redo').getAttribute('aria-keyshortcuts')]).toEqual(['Undo', expect.stringMatching(/^(?:Control|Meta)\+Shift\+Z$/)])
    try {
      setXhConfig(reportZhCN)
      designer.requestUpdate()
      await designer.updateComplete
      expect(buttons().map(item => item.getAttribute('aria-label'))).toEqual(['撤销', '重做', '剪切', '复制', '粘贴', '创建副本', '删除', '缩小', '放大', '适合窗口', '实际大小', '设计', '预览', '面板', '设置', '帮助'])
      expect(designer.querySelector('[data-region="toolbar"] [aria-label="设计器操作"]')).not.toBeNull()
      expect(designer.querySelector('xh-designer-frame')!.regions?.find(region => region.name === 'toolbar')?.label).toBe('设计器操作')
    }
    finally {
      setXhConfig({})
    }
  })

  it('内建菜单建好时填空白处的条目；右键事件不取消时按落点重填：卡片上与空白处各一套，不可用的写 aria-disabled，选中条目执行命令', async () => {
    const designer = await mount()
    const content = designer.querySelector('xh-context-menu [data-xh-part="positioner"] > [data-xh-part="content"]')!
    const entries = (): [string | null, boolean][] => [...content.querySelectorAll('[data-xh-part="item"]')].map(item => [item.getAttribute('value'), item.getAttribute('aria-disabled') === 'true'])
    expect(entries()).toEqual([['paste', true], ['select-all', false], ['zoom-to-fit', false]])
    card(designer, 'a').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(designer.getSelection()).toEqual({ cards: ['a'] })
    expect(entries()).toEqual([['cut', false], ['copy', false], ['paste', true], ['duplicate', false], ['delete', false]])
    expect(content.querySelector('[data-xh-part="item"][value="cut"]')!.textContent).toBe('Cut')
    expect([...content.querySelectorAll('[data-xh-part="item"]')].filter(item => !item.querySelector('[data-xh-part="item-icon"] xh-icon')).map(item => item.getAttribute('value'))).toEqual([])
    expect(content.querySelector('[data-xh-part="item"][value="delete"]')!.getAttribute('data-tone')).toBe('danger')
    designer.querySelector('xh-context-menu')!.dispatchEvent(new CustomEvent('select', { detail: { value: 'delete' } }))
    expect(cards(designer).map(item => item.id)).toEqual(['pie', 'b'])
    designer.querySelector('[data-part="surface"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(entries()).toEqual([['paste', true], ['select-all', false], ['zoom-to-fit', false]])
    designer.addEventListener('card-contextmenu', event => event.preventDefault())
    card(designer, 'b').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(entries()).toEqual([['paste', true], ['select-all', false], ['zoom-to-fit', false]])
  })

  it('字段栏的联动一段：新增以选中卡片为源的联动并选中它，属性面板编辑源维度与目标，点叉删除', async () => {
    const designer = await mount()
    designer.select({ cards: ['pie'] })
    await designer.updateComplete
    const links = designer.querySelector<HTMLElement>('[data-part="well-links"]')!
    expect(links.hidden).toBe(false)
    links.querySelector<HTMLButtonElement>('[data-part="well-add-link"] button')!.click()
    await designer.updateComplete
    expect((designer.schema!.body as DashboardView).links).toEqual([{ id: 'link1', card: 'pie', dimension: 'region', targets: [] }])
    expect(designer.getSelection()).toEqual({ cards: ['pie'], link: 'link1' })
    const panel = designer.querySelector('xh-designer-properties')!
    expect(panel.targets!.map(target => target.kind)).toEqual(['link'])
    expect(panel.targets![0]!.descriptors.find(descriptor => descriptor.path[0] === 'dimension')!.control).toEqual({ kind: 'select', options: [{ value: 'region', label: 'region' }] })
    panel.dispatchEvent(new CustomEvent('property-change', { detail: { path: ['targets'], value: [{ card: 'a', field: 'region' }], targets: [{ kind: 'link', id: 'link1' }], merge: 'x' } }))
    await designer.updateComplete
    expect(links.querySelector('xh-tag[data-link="link1"]')!.textContent).toBe('region → 1 card')
    links.querySelector('xh-tag[data-link="link1"]')!.dispatchEvent(new CustomEvent('open-change', { detail: { open: false } }))
    expect((designer.schema!.body as DashboardView).links).toBeUndefined()
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

describe('<xh-report-designer>：缩放', () => {
  function toolbarButton(designer: XhReportDesigner, command: string): HTMLButtonElement {
    return designer.querySelector(`[data-region="toolbar"] button[value="${command}"]`)!
  }

  function zoom(designer: XhReportDesigner): number {
    return designer.getViewport().zoom
  }

  /** 可见区 800 × 600 在 (0, 0)；surface 的屏幕位置随滚动走。 */
  function placeViewport(designer: XhReportDesigner): HTMLElement {
    const scroller = designer.querySelector<HTMLElement>('[data-part="scroller"]')!
    stub(designer.querySelector('xh-designer-transform')!, { x: 0, y: 0, width: 800, height: 600 })
    designer.querySelector('[data-part="surface"]')!.getBoundingClientRect = () => {
      const x = -scroller.scrollLeft
      const y = -scroller.scrollTop
      return { x, y, left: x, top: y, width: 800, height: 600, right: x + 800, bottom: y + 600, toJSON: () => ({}) }
    }
    return scroller
  }

  it('工具栏的缩放一组：放大、缩小按 1.2 倍一档，实际大小回到 1，夹在 10%–400%；倍数落到 surface 上，派发 viewport-change，不进报表；预览态不可用', async () => {
    const designer = await mount()
    const viewports = events(designer, 'viewport-change') as { viewport: { zoom: number } }[]
    const schemaChanges = events(designer, 'schema-change')
    const groups = Array.from(designer.querySelectorAll('[data-part="command-bar"] [data-xh-part="group"]'), group => Array.from(group.querySelectorAll('button'), button => button.value))
    expect(groups).toContainEqual(['zoom-out', 'zoom-in', 'zoom-to-fit', 'zoom-to-actual'])
    expect(['zoom-out', 'zoom-in', 'zoom-to-fit', 'zoom-to-actual'].map(command => toolbarButton(designer, command).hasAttribute('data-icon'))).toEqual([true, true, true, true])
    toolbarButton(designer, 'zoom-in').click()
    expect(zoom(designer)).toBe(1.2)
    expect(designer.style.getPropertyValue('--xh-report-designer-zoom')).toBe('1.2')
    toolbarButton(designer, 'zoom-out').click()
    toolbarButton(designer, 'zoom-out').click()
    expect(zoom(designer)).toBeCloseTo(1 / 1.2)
    toolbarButton(designer, 'zoom-to-actual').click()
    expect(zoom(designer)).toBe(1)
    for (let index = 0; index < 30; index++)
      designer.zoomOut()
    expect(zoom(designer)).toBe(0.1)
    for (let index = 0; index < 30; index++)
      designer.zoomIn()
    expect(zoom(designer)).toBe(4)
    expect(viewports.at(-1)!.viewport.zoom).toBe(4)
    expect([schemaChanges, designer.dirty, designer.canUndo]).toEqual([[], false, false])
    expect(designer.schema).toEqual(board)
    designer.mode = 'preview'
    await designer.updateComplete
    expect(['zoom-out', 'zoom-in', 'zoom-to-fit', 'zoom-to-actual'].map(command => toolbarButton(designer, command).disabled)).toEqual([true, true, true, true])
  })

  it('放大、缩小以可见区中心为锚：中心对着的画布点缩放前后都在中心', async () => {
    const designer = await mount()
    const scroller = placeViewport(designer)
    designer.zoomIn()
    expect(scroller.scrollTop).toBeCloseTo(60)
    const { y, zoom: scale } = designer.getViewport()
    expect(300 * scale + y).toBeCloseTo(300)
    designer.zoomToActual()
    expect(zoom(designer)).toBe(1)
    expect(scroller.scrollTop).toBeCloseTo(0)
  })

  it('快捷键：+ 与 = 放大，- 缩小；Ctrl / ⌘ 加滚轮以指针为中心缩放，不带修饰键的滚轮照常滚动画布', async () => {
    const designer = await mount()
    const scroller = placeViewport(designer)
    key(designer, '+')
    expect(zoom(designer)).toBe(1.2)
    key(designer, '=')
    key(designer, '+', { shiftKey: true })
    expect(zoom(designer)).toBeCloseTo(1.728)
    key(designer, '-')
    key(designer, '-')
    key(designer, '-')
    expect(zoom(designer)).toBeCloseTo(1)
    designer.zoomToActual()
    const canvas = designer.querySelector('[data-part="canvas"]')!
    const plain = new WheelEvent('wheel', { deltaY: 100, clientX: 200, clientY: 100, bubbles: true, cancelable: true })
    canvas.dispatchEvent(plain)
    expect([plain.defaultPrevented, zoom(designer)]).toEqual([false, 1])
    const pinch = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: 200, clientY: 100, bubbles: true, cancelable: true })
    canvas.dispatchEvent(pinch)
    expect(pinch.defaultPrevented).toBe(true)
    expect(zoom(designer)).toBeCloseTo(Math.exp(0.2))
    const viewport = designer.getViewport()
    expect(100 * viewport.zoom + viewport.y).toBeCloseTo(100)
    expect(scroller.scrollTop).toBeCloseTo(100 * (Math.exp(0.2) - 1))
  })

  it('适合窗口：内容的高度落进可见区、不放大到实际尺寸以上，滚回左上角；此后尺寸变了重新适配，直到改了缩放或在画布上按下指针', async () => {
    const observers: (() => void)[] = []
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) {
        observers.push(callback)
      }

      observe(): void {}
      disconnect(): void {}
    })
    const designer = await mount()
    const scroller = designer.querySelector<HTMLElement>('[data-part="scroller"]')!
    const content = designer.querySelector<HTMLElement>('[data-part="surface"] > [data-part="content"]')!
    let height = 1000
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => 500 })
    Object.defineProperty(content, 'offsetHeight', { configurable: true, get: () => height })
    const resized = (): void => observers.forEach(callback => callback())
    scroller.scrollTop = 120
    toolbarButton(designer, 'zoom-to-fit').click()
    expect([zoom(designer), scroller.scrollTop]).toEqual([0.5, 0])
    height = 2000
    resized()
    expect(zoom(designer)).toBe(0.25)
    height = 300
    resized()
    expect(zoom(designer)).toBe(1)
    designer.zoomIn()
    height = 1000
    resized()
    expect(zoom(designer)).toBe(1.2)
    key(designer, '0')
    expect(zoom(designer)).toBe(0.5)
    press(card(designer, 'a'))
    height = 2000
    resized()
    expect(zoom(designer)).toBe(0.5)
  })

  it('缩放之后覆盖层的移动、改大小手势照样换成格坐标：屏幕上量出的网格除以缩放倍数', async () => {
    const designer = await mount()
    designer.setViewport({ x: 0, y: 0, zoom: 0.5 })
    placeGrid(designer, 0.5)
    transform(designer, 'start', 'move', 'a', { x: 400, y: 0, width: 400, height: 80 })
    transform(designer, 'move', 'move', 'a', { x: 10, y: 170, width: 400, height: 80 })
    transform(designer, 'end', 'move', 'a', { x: 10, y: 170, width: 400, height: 80 })
    expect(cards(designer).find(item => item.id === 'a')!.layout).toEqual({ x: 0, y: 4, w: 4, h: 2 })
    transform(designer, 'start', 'resize', 'b', { x: 800, y: 0, width: 400, height: 80 })
    transform(designer, 'move', 'resize', 'b', { x: 700, y: 0, width: 650, height: 160 })
    transform(designer, 'end', 'resize', 'b', { x: 700, y: 0, width: 650, height: 160 })
    expect(cards(designer).find(item => item.id === 'b')!.layout).toEqual({ x: 7, y: 0, w: 5, h: 4 })
  })

  it('缩放之后覆盖层的视口带上倍数，选中框、悬停框与框选都按实际尺寸下的画布像素', async () => {
    const designer = await mount()
    designer.setViewport({ x: 0, y: 0, zoom: 0.5 })
    placeGrid(designer, 0.5)
    designer.select({ cards: ['a'] })
    await designer.updateComplete
    const overlay = designer.querySelector('xh-designer-transform')!
    expect(overlay.viewport).toEqual({ x: 0, y: 0, zoom: 0.5 })
    expect(overlay.items).toEqual([{ id: 'a', rect: { x: 400, y: 0, width: 400, height: 80 }, minSize: { width: 100, height: 40 } }])
    card(designer, 'b').dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
    expect(overlay.hover).toEqual({ x: 800, y: 0, width: 400, height: 80 })
    overlay.dispatchEvent(new CustomEvent('marquee', { detail: { phase: 'end', rect: { x: 350, y: -10, width: 900, height: 120 }, mode: 'contain', additive: false } }))
    expect(designer.getSelection()).toEqual({ cards: ['a', 'b'] })
  })

  it('缩放之后从物料面板拖进来的卡片以指针对着的画布点为中心落格，落点预览是实际尺寸下的画布像素', async () => {
    const designer = await mount()
    designer.setViewport({ x: 0, y: 0, zoom: 0.5 })
    placeGrid(designer, 0.5)
    const scroller = designer.querySelector<HTMLElement>('[data-part="scroller"]')!
    stub(scroller, { x: 0, y: 0, width: 600, height: 400 })
    document.elementFromPoint = () => scroller
    const source = document.createElement('button')
    document.body.append(source)
    source.addEventListener('pointerdown', event => startDrag(event, { payload: { source: 'palette', id: 'metric', payload: 'metric' } satisfies DesignerPaletteDragPayload }))
    const pointer = (target: EventTarget, type: string, x: number, y: number): void => {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: x, clientY: y }))
    }
    pointer(source, 'pointerdown', 10, 10)
    pointer(document, 'pointermove', 475, 70)
    const preview = designer.querySelector<HTMLElement>('[data-part="drop-preview"]')!
    expect(preview.hidden).toBe(false)
    expect([preview.style.insetInlineStart, preview.style.insetBlockStart, preview.style.inlineSize, preview.style.blockSize]).toEqual(['800px', '80px', '300px', '120px'])
    pointer(document, 'pointerup', 475, 70)
    expect(cards(designer).at(-1)).toMatchObject({ id: 'metric1', layout: { x: 8, y: 2, w: 3, h: 3 } })
    expect(preview.hidden).toBe(true)
  })
})
