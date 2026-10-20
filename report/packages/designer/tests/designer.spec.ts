// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView, DatasetRequest, ReportDocument, ValidationIssue } from '@xihan-report/core'
import type { XhReportViewer } from '@xihan-report/runtime'
import type { JsonValue } from '@xihan-ui/core/json'
import type { DesignerPaletteDragPayload, XhDesignerJsonEditorElement } from '@xihan-ui/designer-shell'
import type { XhSortableElement, XhTreeElement } from '@xihan-ui/web-components/define'
import type { ReportDesignerExtension, XhReportDesigner } from '../src'
import { DEFAULT_REPORT_DESIGNER_TRANSLATIONS } from '@xihan-report/runtime'
import { reportZhCN } from '@xihan-report/runtime/locale'
import { formatJsonPath } from '@xihan-ui/core/json'
import { DesignerExtensionError } from '@xihan-ui/designer-kit'
import { inferDataFields } from '@xihan-ui/designer-kit/field-inference'
import { DESIGNER_COMMANDS_EN_US, DESIGNER_HISTORY_EN_US, DESIGNER_SETTING_KEYS, startDrag } from '@xihan-ui/designer-shell'
import { EyeIcon, MapIcon, PanelLeftIcon } from '@xihan-ui/icons'
import { setXhConfig } from '@xihan-ui/web-components'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReportDesignerModel, defineReportDesigner, REPORT_CARD_TYPE_ICONS, REPORT_DESIGNER_HELP_URL, REPORT_DESIGNER_PANELS, REPORT_MENU_LAYOUT } from '../src'

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

/** 开发者模式开着的设置：编辑 JSON 这类调试入口只在这时出现。 */
const DEVELOPER: Readonly<Record<string, boolean>> = { [DESIGNER_SETTING_KEYS.developer]: true }

async function mount(options: { provider?: (request: DatasetRequest) => void, settings?: Readonly<Record<string, boolean>>, draftKey?: string } = {}): Promise<XhReportDesigner> {
  const designer = document.createElement('xh-report-designer')
  // 用例里不自动开始新手引导，引导的用例自己打开
  designer.autoTour = false
  if (options.settings)
    designer.settings = { ...options.settings }
  if (options.draftKey !== undefined)
    designer.draftKey = options.draftKey
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
  designer.querySelector('[data-part="scroller"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true, ...init }))
}

/** 菜单栏的 <xh-menubar>：按数据铺的菜单与勾选。 */
type MenubarHost = HTMLElement & {
  collection?: { value: string, label?: string, items?: { value: string, icon?: unknown, children?: { value: string, kind?: string }[], checkboxValue?: string[] }[] }[]
  checkboxValue?: string[]
}

/** 菜单栏上一张菜单里的命令 id。 */
function menubarItems(designer: XhReportDesigner, menu: string): string[] {
  const menubar = designer.querySelector<MenubarHost>('xh-menubar')!
  return menubar.collection!.find(node => node.value === menu)!.items!.map(item => item.value.slice(menu.length + 1))
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

  it('画布可聚焦的是滚动区：带 group 角色与名字，键盘能滚动它；外壳不占 Tab 位，按下卡片时焦点落到滚动区', async () => {
    const designer = await mount()
    const scroller = designer.querySelector<HTMLElement>('[data-part="scroller"]')!
    expect([scroller.getAttribute('role'), scroller.getAttribute('tabindex'), scroller.getAttribute('aria-label')]).toEqual(['group', '0', 'Canvas'])
    expect(designer.querySelector('[data-part="canvas"]')!.hasAttribute('tabindex')).toBe(false)
    press(card(designer, 'a'))
    expect(document.activeElement).toBe(scroller)
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

  it('画布上的表格视图与卡片内容是 inert：表格行、图例与图形不占 Tab 位，点在卡片内容上落到卡片外壳', async () => {
    const designer = await mount({ provider: () => {} })
    designer.schema = { ...board, body: { type: 'table', dataset: 'sales', columns: [{ id: 'region', field: 'region' }] } }
    await settle()
    expect(designer.querySelector('[data-part="surface"] [data-part="view"]')!.hasAttribute('inert')).toBe(true)
    designer.schema = board
    await settle()
    expect([...designer.querySelectorAll('[data-part="card"] > [data-part="card-body"]')].map(body => body.hasAttribute('inert'))).toEqual([true, true, true])
    expect([...designer.querySelectorAll('[data-part="card"]')].map(section => section.hasAttribute('inert'))).toEqual([false, false, false])
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

  it('方向键挪一格（压到的卡片让开），Shift 加方向键改大小；同一张卡片相隔不超过 1 秒的连按并成一步撤销，隔久了或换过选中另起一步', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(0)
      const designer = await mount()
      const steps = (): number => designer.historyState.entries.length
      designer.select({ cards: ['a'] })
      key(designer, 'ArrowRight')
      expect((designer.schema!.body as DashboardView).cards[1]!.layout).toMatchObject({ x: 5 })
      vi.setSystemTime(500)
      key(designer, 'ArrowLeft', { shiftKey: true })
      expect((designer.schema!.body as DashboardView).cards[1]!.layout).toMatchObject({ w: 3 })
      expect(steps()).toBe(1)
      vi.setSystemTime(2000)
      key(designer, 'ArrowRight')
      expect(steps()).toBe(2)
      designer.select({ cards: ['b'] })
      designer.select({ cards: ['a'] })
      vi.setSystemTime(2100)
      key(designer, 'ArrowRight')
      expect(steps()).toBe(3)
      designer.undo()
      designer.undo()
      designer.undo()
      expect(designer.schema).toEqual(board)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('同时选中多张卡片时方向键不挪动', async () => {
    const designer = await mount()
    designer.select({ cards: ['a', 'b'] })
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    designer.querySelector('[data-part="scroller"]')!.dispatchEvent(event)
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

  it('物料面板放在外框的物料区，按图表、指标、表格分组列出卡片种类；设置里的布局隐藏它时收起', async () => {
    const designer = await mount()
    const palette = designer.querySelector('xh-designer-palette')!
    expect(palette.closest('[data-region="palette"]')).not.toBeNull()
    expect(palette.groups!.map(group => [group.label, group.items.length])).toEqual([['Charts', 7], ['Metrics', 1], ['Tables', 3]])
    expect(palette.groups![0]!.items[1]).toMatchObject({ id: 'chart.pie', label: 'Pie chart', payload: 'chart.pie' })
    designer.settings = { [DESIGNER_SETTING_KEYS.layout]: { version: 1, hidden: ['palette'] } }
    await designer.updateComplete
    expect(designer.querySelector('xh-designer-frame')!.showsPanel('palette')).toBe(false)
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
    expect(frame.showsPanel('parameters')).toBe(true)
    tree.dispatchEvent(new CustomEvent('selection-change', { detail: { value: ['["field","sales","amount"]'] } }))
    expect(designer.getSelection()).toEqual({ cards: [], data: { kind: 'field', dataset: 'sales', name: 'amount' } })
    expect(tree.selection).toEqual(['["field","sales","amount"]'])
    designer.select({ cards: ['a'] })
    expect(tree.selection).toEqual([])
    designer.readonly = true
    await designer.updateComplete
    expect(frame.regions!.map(region => region.name)).not.toContain('parameters')
    expect(frame.showsPanel('datasets')).toBe(true)
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
    expect(designer.historyState.entries.at(-1)!.label).toBe('Delete field "region" and 1 reference')
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
    expect(designer.historyState.entries.map(entry => entry.label)).toEqual(['Rename field "region" to "area"'])
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
    const t = DEFAULT_REPORT_DESIGNER_TRANSLATIONS
    const aggregate = panel.targets![0]!.descriptors.find(descriptor => formatJsonPath(descriptor.path) === 'aggregate')!
    expect(designer.historyState.entries.at(-1)!.label).toBe(t.historyStep({ action: 'update', kind: t.objectKinds.measure!, name: 'amount', count: 1, property: panel.labelOf!(aggregate) }))
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

  it('报表参数的固定候选项用选项表逐行编辑，重复的取值标在那一格上；数值参数的值格是数字框、写回数值，布尔参数固定两行、值格只读', async () => {
    interface FieldArray extends HTMLElement {
      items: readonly { readonly key: string }[]
      readonly updateComplete: Promise<unknown>
    }
    const designer = await mount()
    designer.schema = { ...board, parameters: [
      { name: 'region', type: 'string', options: [{ value: 'East' }, { value: 'East', label: '东' }] },
      { name: 'year', type: 'number', options: [{ value: 2025 }] },
      { name: 'paid', type: 'boolean', options: [{ value: true, label: '已付' }, { value: false, label: '未付' }] },
    ] }
    await designer.updateComplete
    const options = async (name: string): Promise<FieldArray> => {
      designer.select({ data: { kind: 'parameter', name } })
      await designer.updateComplete
      const array = designer.querySelector<FieldArray>('xh-designer-properties [data-path="options"] xh-field-array')!
      await array.updateComplete
      await array.updateComplete
      return array
    }
    const cell = (array: FieldArray, index: number, column: string): HTMLElement & { errorText?: string } =>
      array.querySelector(`[slot="item-cell:${array.items[index]!.key}:${column}"]`)!
    const region = await options('region')
    expect(region.items).toHaveLength(2)
    expect([cell(region, 0, 'value').errorText ?? '', cell(region, 1, 'value').errorText]).toEqual(['', 'Duplicate option value'])
    cell(region, 1, 'value').querySelector('xh-text-field')!.dispatchEvent(new CustomEvent('value-change', { detail: { value: 'West' } }))
    expect(designer.schema!.parameters![0]!.options).toEqual([{ value: 'East' }, { value: 'West', label: '东' }])
    const year = await options('year')
    cell(year, 0, 'value').querySelector('xh-number-field')!.dispatchEvent(new CustomEvent('value-change', { detail: { value: '2026', valueAsNumber: 2026 } }))
    expect(designer.schema!.parameters![1]!.options).toEqual([{ value: 2026 }])
    const paid = await options('paid')
    expect(paid.items).toHaveLength(2)
    expect([0, 1].map(index => cell(paid, index, 'value').querySelector('xh-text-field')!.hasAttribute('read-only'))).toEqual([true, true])
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

  it('切到预览态：画布换成查看器，交给它当前的报表与取数回调，外框只登记菜单栏、工具栏与画布；切换时派发 mode-change', async () => {
    const designer = await mount()
    const modes = events(designer, 'mode-change')
    const settings = designer.settings
    designer.mode = 'preview'
    await designer.updateComplete
    const viewer = designer.querySelector<XhReportViewer>('[data-part="preview"] xh-report-viewer')!
    expect(viewer.schema).toBe(designer.schema)
    expect(designer.querySelector<HTMLElement>('[data-part="canvas"]')!.hidden).toBe(true)
    expect(designer.querySelector('xh-designer-frame')!.regions!.map(region => region.name)).toEqual(['menubar', 'toolbar', 'canvas'])
    expect(designer.querySelector('[data-region="palette"]')).toBeNull()
    expect(designer.settings).toBe(settings)
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

  it('点卡片头的关闭钮收起那块面板：整份布局写进设置的 layout.panels 并派发 settings-change，外框的 layout-change 不冒出来；不登记的报表参数卡片再登记时照样显示', async () => {
    const designer = await mount()
    const frame = designer.querySelector('xh-designer-frame')!
    const seen = events(designer, 'settings-change') as { key: string, value: { version: number, hidden: string[] }, settings: Record<string, unknown> }[]
    let fromFrame = 0
    const count = (): void => {
      fromFrame++
    }
    document.addEventListener('layout-change', count)
    try {
      designer.querySelector<HTMLButtonElement>('[data-region="palette"] [data-part="panel-close"]')!.click()
      await designer.updateComplete
      expect(seen).toHaveLength(1)
      expect([seen[0]!.key, seen[0]!.value.version, [...seen[0]!.value.hidden].sort()]).toEqual([DESIGNER_SETTING_KEYS.layout, 1, ['history', 'palette']])
      expect(seen[0]!.settings).toEqual({ [DESIGNER_SETTING_KEYS.layout]: seen[0]!.value })
      expect(designer.settings).toBe(seen[0]!.settings)
      expect([frame.showsPanel('palette'), frame.showsPanel('parameters')]).toEqual([false, true])
      expect(fromFrame).toBe(0)
      designer.readonly = true
      await designer.updateComplete
      expect(frame.regions!.map(region => region.name)).not.toContain('parameters')
      designer.querySelector<HTMLButtonElement>('[data-region="issues"] [data-part="panel-close"]')!.click()
      await designer.updateComplete
      expect([...seen.at(-1)!.value.hidden].sort()).toEqual(['history', 'issues', 'palette'])
      designer.readonly = false
      await designer.updateComplete
      expect([frame.showsPanel('parameters'), frame.showsPanel('issues'), frame.showsPanel('palette')]).toEqual([true, false, false])
    }
    finally {
      document.removeEventListener('layout-change', count)
    }
  })

  it('工具栏：按钮随选择与历史启用，点按钮执行命令，设计与预览两个按钮切换模式；只读时编辑类命令不可用', async () => {
    const designer = await mount()
    const button = (command: string): HTMLButtonElement => designer.querySelector(`[data-region="toolbar"] button[value="${command}"]`)!
    expect([...designer.querySelectorAll('[data-region="toolbar"] button[value]')].map(item => item.textContent)).toEqual(['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Duplicate', 'Delete', 'Hand tool', 'Zoom out', 'Zoom in', 'Zoom to fit', 'Actual size', 'Design', 'Preview', 'Panels'])
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

  it('工具栏末组只留面板；设置与帮助只在常开的菜单栏里，设置里写了 toolbar.menubar 也不起作用：设置打开设置对话框，帮助在新窗口打开文档站的设计器一页', async () => {
    const designer = await mount()
    const frame = designer.querySelector('xh-designer-frame')!
    const groups = (): string[][] => Array.from(designer.querySelectorAll('[data-part="command-bar"] [data-xh-part="group"]'), group => Array.from(group.querySelectorAll('button'), button => button.value))
    expect(groups().at(-1)).toEqual(['panels'])
    designer.settings = { 'toolbar.menubar': false }
    await designer.updateComplete
    expect([groups().at(-1), frame.regions!.map(region => region.name).includes('menubar')]).toEqual([['panels'], true])
    const menubar = designer.querySelector<MenubarHost>('xh-menubar')!
    const select = (menu: string, id: string): void => void menubar.dispatchEvent(new CustomEvent('item-select', { detail: { menu, value: `${menu}/${id}` } }))
    select('file', 'settings')
    await designer.updateComplete
    expect(designer.querySelector<HTMLElement & { open?: boolean }>('xh-designer-settings')!.open).toBe(true)
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    select('help', 'help')
    expect(open).toHaveBeenCalledWith(REPORT_DESIGNER_HELP_URL, '_blank', 'noopener,noreferrer')
  })

  it('没有顶栏与插入钮：外框不登记 header 区，设计器里没有放进顶栏的内容，命令表里没有 insert:<种类>；物料只从物料面板拖或点', async () => {
    const designer = await mount()
    const frame = designer.querySelector('xh-designer-frame')!
    expect(frame.regions!.map(region => region.name)).not.toContain('header')
    expect(designer.querySelector('[slot^="header"]')).toBeNull()
    expect([...createReportDesignerModel([]).commands.keys()].filter(id => id.startsWith('insert:'))).toEqual([])
  })

  it('菜单栏：外框最上一条，文件、编辑、视图、数据、帮助五张菜单；开发者模式开着时编辑菜单末尾是编辑 JSON；视图收尾是面板与外观，工具栏、状态栏两条显示开关在外观子菜单里；帮助里的开始引导用地图图标；数据菜单是导入数据集、字段与参数，没有导入器时不列导入模板，文件菜单也没有打开文件', async () => {
    const designer = await mount({ settings: DEVELOPER })
    const menubar = designer.querySelector<MenubarHost>('xh-menubar')!
    expect(menubar.closest('[data-region]')!.getAttribute('data-region')).toBe('menubar')
    expect(menubar.collection!.map(node => [node.value, node.label])).toEqual([['file', 'File'], ['edit', 'Edit'], ['view', 'View'], ['data', 'Data'], ['help', 'Help']])
    expect(menubarItems(designer, 'file')).toEqual(['save', 'settings'])
    expect(menubarItems(designer, 'edit')).toEqual(['undo', 'redo', 'cut', 'copy', 'paste', 'delete', 'duplicate', 'select-all', 'edit-json'])
    expect(menubarItems(designer, 'view')).toEqual(['design', 'preview', 'zoom-in', 'zoom-out', 'zoom-to-fit', 'zoom-to-actual', 'pan-tool', 'panels', 'appearance'])
    expect(menubarItems(designer, 'data')).toEqual(['import-dataset', 'import-fields', 'import-parameters'])
    expect(menubarItems(designer, 'help')).toEqual(['start-tour', 'help', 'shortcuts', 'about'])
    expect(menubar.checkboxValue).toEqual(['view/design'])
    const view = menubar.collection!.find(node => node.value === 'view')!.items!
    const appearance = view.find(item => item.value === 'view/appearance')!
    const toggles = ['show-toolbar', 'show-status-bar'].map(id => `view/appearance/command:${id}`)
    expect([appearance.children!.map(child => [child.value, child.kind]), appearance.checkboxValue]).toEqual([toggles.map(value => [value, 'checkbox']), toggles])
    expect([view.find(item => item.value === 'view/panels')!.icon, appearance.icon]).toEqual([PanelLeftIcon, EyeIcon])
    expect(menubar.collection!.find(node => node.value === 'help')!.items!.find(item => item.value === 'help/start-tour')!.icon).toBe(MapIcon)
  })

  it('菜单栏的条目执行命令：保存派发 save，画布上按 Ctrl+S 走同一条命令；显示开关改设置并派发 settings-change，菜单栏常开、没有它的开关', async () => {
    const designer = await mount()
    const menubar = designer.querySelector<MenubarHost>('xh-menubar')!
    const frame = designer.querySelector('xh-designer-frame')!
    const select = (menu: string, id: string): void => void menubar.dispatchEvent(new CustomEvent('item-select', { detail: { menu, value: `${menu}/${id}` } }))
    const saves = events(designer, 'save')
    const changes = events(designer, 'settings-change') as { key: string, value: unknown }[]
    select('file', 'save')
    const ctrlS = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
    designer.querySelector('[data-part="scroller"]')!.dispatchEvent(ctrlS)
    expect([saves, ctrlS.defaultPrevented, createReportDesignerModel([]).commands.get('save')?.shortcut]).toEqual([[{}, {}], true, ['Mod', 'S']])
    select('view', 'appearance/command:show-status-bar')
    await designer.updateComplete
    expect([changes.map(change => [change.key, change.value]), frame.regions!.map(region => region.name)]).toEqual([[[DESIGNER_SETTING_KEYS.statusBar, false]], expect.not.arrayContaining(['status'])])
    expect([createReportDesignerModel([]).commands.has('show-menubar'), frame.regions!.map(region => region.name).includes('menubar')]).toEqual([false, true])
  })

  it('宿主写在设计器上的 slot="menubar-end" 放到菜单栏右边一段：连上之前写的、之后加的都一样', async () => {
    const designer = document.createElement('xh-report-designer')
    designer.autoTour = false
    const title = document.createElement('span')
    title.slot = 'menubar-end'
    title.textContent = '销售看板'
    designer.append(title)
    designer.schema = board
    document.body.append(designer)
    await designer.updateComplete
    const frame = designer.querySelector('xh-designer-frame')!
    await frame.updateComplete
    expect([title.parentElement!.getAttribute('data-zone'), title.closest('[data-region]')?.getAttribute('data-region')]).toEqual(['end', 'menubar'])
    const state = document.createElement('span')
    state.slot = 'menubar-end'
    designer.append(state)
    await Promise.resolve()
    await frame.updateComplete
    expect(state.closest('[data-region]')?.getAttribute('data-region')).toBe('menubar')
  })

  it('画布有焦点时按 F10 把焦点交给菜单栏，再按 F10 回到画布', async () => {
    const designer = await mount()
    await designer.querySelector('xh-designer-frame')!.updateComplete
    const scroller = designer.querySelector<HTMLElement>('[data-part="scroller"]')!
    scroller.focus()
    const f10 = (): void => void (document.activeElement ?? scroller).dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', bubbles: true, cancelable: true }))
    f10()
    expect(designer.querySelector('xh-menubar')!.contains(document.activeElement)).toBe(true)
    f10()
    expect(document.activeElement).toBe(scroller)
  })

  it('「面板」点开一张锚在按钮上的菜单，列出能开关的八块卡片（勾选的显示，历史记录缺省不勾），再列显示或隐藏所有面板、还原面板显隐与恢复默认布局；选中一块卡片开关它并写进设置', async () => {
    const designer = await mount()
    const frame = designer.querySelector('xh-designer-frame')!
    await frame.updateComplete
    const button = designer.querySelector<HTMLButtonElement>('[data-region="toolbar"] button[value="panels"]')!
    expect(button.disabled).toBe(false)
    button.click()
    await designer.updateComplete
    type MenuHost = HTMLElement & { open?: boolean, anchor?: HTMLElement | null, collection?: readonly { value: string }[], checkboxValue?: readonly string[] }
    const menu = designer.querySelector<MenuHost>('[data-part="command-bar"] xh-menu')!
    const all = Object.values(REPORT_DESIGNER_PANELS).map(name => `item:${name}`)
    const values = menu.collection!.map(item => item.value)
    expect([menu.open, menu.anchor]).toEqual([true, button])
    expect(values.filter(value => value.startsWith('item:')).sort()).toEqual([...all].sort())
    expect(values.filter(value => !value.startsWith('item:'))).toEqual(expect.arrayContaining([expect.stringContaining('panels-toggle-all'), expect.stringContaining('panels-restore'), expect.stringContaining('layout-reset')]))
    expect([...menu.checkboxValue!].sort()).toEqual(all.filter(value => value !== 'item:history').sort())
    const seen = events(designer, 'settings-change') as { key: string, value: { hidden: string[] } }[]
    menu.dispatchEvent(new CustomEvent('item-select', { detail: { value: 'item:wells' } }))
    await designer.updateComplete
    await frame.updateComplete
    expect(seen.map(change => [change.key, change.value.hidden])).toEqual([[DESIGNER_SETTING_KEYS.layout, ['history', 'wells']]])
    expect(frame.showsPanel('wells')).toBe(false)
    expect(menu.checkboxValue).not.toContain('item:wells')
    menu.dispatchEvent(new CustomEvent('item-select', { detail: { value: 'item:wells' } }))
    await designer.updateComplete
    await frame.updateComplete
    expect(frame.showsPanel('wells')).toBe(true)
  })

  it('每块内置面板一条开关命令 panel:<面板 id>，排进 commandLayout 就上工具栏：文字取面板标题，按下态是它此刻显示；显示或隐藏所有面板、恢复默认布局都写进设置', async () => {
    const designer = await mount()
    const frame = designer.querySelector('xh-designer-frame')!
    const t = DEFAULT_REPORT_DESIGNER_TRANSLATIONS
    designer.commandLayout = { toolbar: [['panel:wells', 'panels-toggle-all', 'layout-reset']] }
    await designer.updateComplete
    const button = (command: string): HTMLButtonElement => designer.querySelector(`[data-region="toolbar"] button[value="${command}"]`)!
    const panels = Object.values(REPORT_DESIGNER_PANELS)
    expect([button('panel:wells').textContent, button('panel:wells').getAttribute('aria-pressed')]).toEqual([t.wells, 'true'])
    button('panel:wells').click()
    await designer.updateComplete
    expect([frame.showsPanel('wells'), button('panel:wells').getAttribute('aria-pressed')]).toEqual([false, 'false'])
    button('panels-toggle-all').click()
    await designer.updateComplete
    expect(panels.filter(name => frame.showsPanel(name))).toEqual([])
    button('layout-reset').click()
    await designer.updateComplete
    expect(panels.filter(name => frame.showsPanel(name))).toEqual(panels.filter(name => name !== 'history'))
    expect(designer.settings![DESIGNER_SETTING_KEYS.layout]).toMatchObject({ hidden: ['history'] })
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

  it('设置里关掉状态栏：外框不登记它；这时关掉一块卡片，设置里的状态栏开关照原样留着，再打开状态栏照样出现', async () => {
    const designer = await mount()
    const frame = designer.querySelector('xh-designer-frame')!
    const names = (): string[] => frame.regions!.map(region => region.name)
    designer.settings = { [DESIGNER_SETTING_KEYS.statusBar]: false }
    await designer.updateComplete
    expect(names()).not.toContain('status')
    designer.querySelector<HTMLButtonElement>('[data-region="issues"] [data-part="panel-close"]')!.click()
    await designer.updateComplete
    expect(designer.settings![DESIGNER_SETTING_KEYS.statusBar]).toBe(false)
    expect(names()).not.toContain('status')
    designer.settings = { [DESIGNER_SETTING_KEYS.layout]: designer.settings![DESIGNER_SETTING_KEYS.layout]! }
    await designer.updateComplete
    expect(frame.showsPanel('status')).toBe(true)
    expect(frame.showsPanel('issues')).toBe(false)
  })

  it('历史记录卡片缺省隐藏，打开后在右栏属性下面：零件 headless，列出起点与各步，选一步跳过去；面板头是清空历史，只读时不可用', async () => {
    const designer = await mount()
    const frame = designer.querySelector('xh-designer-frame')!
    expect([frame.showsPanel('history'), designer.querySelector('xh-designer-history')]).toEqual([false, null])
    expect(frame.resolvedLayout.docks.end).toEqual(['wells', 'properties', 'history'])
    expect(frame.regions!.find(region => region.name === 'history')).toMatchObject({ title: 'History', icon: expect.anything(), help: DESIGNER_HISTORY_EN_US.help })
    frame.togglePanel('history')
    await designer.updateComplete
    const history = designer.querySelector('xh-designer-history')!
    expect([history.closest('[data-region="history"]') !== null, history.headless]).toEqual([true, true])
    designer.select({ cards: ['a'] })
    designer.deleteSelection()
    designer.select({ cards: ['b'] })
    designer.deleteSelection()
    await designer.updateComplete
    const snapshot = history.snapshot!
    expect(snapshot.entries.map(entry => entry.state)).toEqual(['done', 'done'])
    expect(snapshot).toEqual(designer.historyState)
    history.dispatchEvent(new CustomEvent('history-go', { detail: { position: snapshot.origin } }))
    await designer.updateComplete
    expect(designer.schema).toEqual(board)
    expect([history.snapshot!.position, history.snapshot!.entries.map(entry => entry.state)]).toEqual([snapshot.origin, ['undone', 'undone']])
    const clear = (): HTMLButtonElement => designer.querySelector<HTMLButtonElement>('[data-region="history"] button[value="clear-history"]')!
    expect(clear().disabled).toBe(false)
    designer.readonly = true
    await designer.updateComplete
    expect([clear().disabled, history.readonly]).toEqual([true, true])
  })

  it('撤销历史的每一步带说明，读的时候按此刻的语言取；history-change 带上与 historyState 相同的快照，撤销、重做的按钮名字写上那一步', async () => {
    const designer = await mount()
    const changes = events(designer, 'history-change')
    designer.select({ cards: ['a'] })
    designer.deleteSelection()
    expect(designer.historyState.entries.map(entry => [entry.label, entry.state])).toEqual([['Delete card "a"', 'done']])
    expect(changes.at(-1)).toEqual(designer.historyState)
    await designer.updateComplete
    const button = (command: string): HTMLButtonElement => designer.querySelector(`[data-region="toolbar"] button[value="${command}"]`)!
    expect(button('undo').getAttribute('aria-label')).toBe('Undo: Delete card "a"')
    designer.undo()
    await designer.updateComplete
    expect([button('undo').getAttribute('aria-label'), button('redo').getAttribute('aria-label')]).toEqual(['Undo', 'Redo: Delete card "a"'])
    try {
      setXhConfig(reportZhCN)
      designer.requestUpdate()
      await designer.updateComplete
      expect(designer.historyState.entries[0]!.label).toBe('删除卡片「a」')
      expect(button('redo').getAttribute('aria-label')).toBe('重做：删除卡片「a」')
    }
    finally {
      setXhConfig({})
    }
  })

  it('goToHistory 一次跳到某一步或起点，只读时不跳；clearHistory 清空撤销与重做，报表不变；historyLimit 在下一次装载时生效', async () => {
    const designer = await mount()
    designer.select({ cards: ['a'] })
    designer.deleteSelection()
    designer.select({ cards: ['b'] })
    designer.deleteSelection()
    const { origin, entries } = designer.historyState
    const changes = events(designer, 'history-change') as { position: number }[]
    expect(designer.goToHistory(origin)).toBe(true)
    expect(designer.schema).toEqual(board)
    expect(changes.map(change => change.position)).toEqual([origin])
    designer.readonly = true
    await designer.updateComplete
    expect(designer.goToHistory(entries[1]!.position)).toBe(false)
    designer.readonly = false
    await designer.updateComplete
    expect(designer.goToHistory(entries[0]!.position)).toBe(true)
    expect(cards(designer).map(item => item.id)).toEqual(['pie', 'b'])
    const schema = designer.schema
    designer.clearHistory()
    expect([designer.schema, designer.canUndo, designer.canRedo, designer.historyState.entries]).toEqual([schema, false, false, []])
    designer.setAttribute('history-limit', '1')
    await designer.updateComplete
    expect(designer.historyLimit).toBe(1)
    designer.schema = structuredClone(board)
    await designer.updateComplete
    designer.select({ cards: ['a'] })
    designer.deleteSelection()
    designer.select({ cards: ['b'] })
    designer.deleteSelection()
    expect([designer.historyState.entries.length, designer.historyState.truncated]).toEqual([1, true])
  })

  it('清空历史是一条命令：先弹确认框，确认后清空并播报，取消不动；只读时不可用。Ctrl+Y 也是重做', async () => {
    const designer = await mount()
    designer.commandLayout = { toolbar: [['undo', 'redo', 'clear-history']] }
    designer.select({ cards: ['a'] })
    designer.deleteSelection()
    designer.undo()
    key(designer, 'y', { ctrlKey: true })
    expect(cards(designer).map(item => item.id)).toEqual(['pie', 'b'])
    await designer.updateComplete
    const clear = (): HTMLButtonElement => designer.querySelector<HTMLButtonElement>('[data-region="toolbar"] button[value="clear-history"]')!
    const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-scope="dialog"][data-part="content"][role="alertdialog"]')
    const footer = (text: string): HTMLButtonElement => [...dialog()!.querySelectorAll<HTMLButtonElement>('[data-part="footer"] button')].find(button => button.textContent === text)!
    expect(clear().disabled).toBe(false)
    clear().click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(dialog()!.textContent).toContain('Clear history?')
    footer('Cancel').click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(designer.historyState.entries).toHaveLength(1)
    const announce = vi.spyOn(designer.querySelector('xh-designer-frame')!, 'announce')
    clear().click()
    await new Promise(resolve => setTimeout(resolve, 0))
    footer('Clear').click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect([designer.historyState.entries, designer.canUndo]).toEqual([[], false])
    expect(announce).toHaveBeenCalledWith('History cleared')
    designer.select({ cards: ['b'] })
    designer.deleteSelection()
    designer.readonly = true
    await designer.updateComplete
    expect(clear().disabled).toBe(true)
  })

  it('选中卡片时选中框上方浮出选中工具条：排列取命令落点 selection:card / selection:multiple，宿主经 commandLayout 改、写空就不放，扩展命令写上落点追加成一组；只读与预览态不放', async () => {
    const designer = await mount()
    const overlay = designer.querySelector('xh-designer-transform')!
    const bar = (): HTMLElement | null => overlay.querySelector<HTMLElement>(`[aria-label="${DEFAULT_REPORT_DESIGNER_TRANSLATIONS.selectionToolbar}"]`)
    const values = (): string[] => [...bar()!.querySelectorAll<HTMLButtonElement>('button[value]')].map(button => button.value)
    expect(bar()).toBeNull()
    designer.select({ cards: ['a'] })
    await designer.updateComplete
    expect(values()).toEqual(['duplicate', 'copy', 'delete'])
    expect(bar()!.closest('[data-part="toolbar"]')!.parentElement).toBe(overlay)
    designer.select({ cards: ['a', 'b'] })
    designer.commandLayout = { 'selection:multiple': [['delete']] }
    await designer.updateComplete
    expect(values()).toEqual(['delete'])
    bar()!.querySelector<HTMLButtonElement>('button[value="delete"]')!.click()
    expect(cards(designer).map(item => item.id)).toEqual(['pie'])
    designer.undo()
    designer.extensions = [{ id: 'acme', commands: [{ id: 'acme.pin', label: 'Pin', placement: ['selection:card'], run: () => {} }] }]
    designer.commandLayout = { 'selection:multiple': [] }
    designer.select({ cards: ['a', 'b'] })
    await designer.updateComplete
    expect(bar()).toBeNull()
    designer.select({ cards: ['a'] })
    await designer.updateComplete
    expect(values()).toEqual(['duplicate', 'copy', 'delete', 'acme.pin'])
    designer.readonly = true
    await designer.updateComplete
    expect(bar()).toBeNull()
    designer.readonly = false
    designer.mode = 'preview'
    await designer.updateComplete
    expect(bar()).toBeNull()
  })

  it('页面结构面板停在左栏物料下面：看板按先行后列列出卡片，有标题写标题、副文本写种类名，没标题写「种类名 · id」，图标取卡片种类；卡片下面是它的列表与项', async () => {
    const designer = await mount()
    const t = DEFAULT_REPORT_DESIGNER_TRANSLATIONS
    const frame = designer.querySelector('xh-designer-frame')!
    expect(frame.resolvedLayout.docks.start).toEqual(['datasets', 'parameters', 'palette', 'outline'])
    expect(frame.regions!.find(region => region.name === 'outline')).toMatchObject({ title: 'Structure', icon: expect.anything() })
    const outline = designer.querySelector('xh-designer-outline')!
    expect(outline.headless).toBe(true)
    const nodes = outline.nodes!
    expect(nodes.map(node => [node.label, node.description, node.movable])).toEqual([['各区域', t.cardTypes['chart.pie'], false], ['a', t.cardTypes.metric, false], ['b', t.cardTypes.metric, false]])
    expect([nodes[0]!.icon, nodes[1]!.icon]).toEqual([REPORT_CARD_TYPE_ICONS['chart.pie'], REPORT_CARD_TYPE_ICONS.metric])
    expect(nodes[0]!.children!.map(list => [list.label, list.selectable, list.movable, list.deletable, list.children!.map(item => item.label)])).toEqual([
      [t.lists.dimensions, false, false, false, ['region']],
      [t.lists.measures, false, false, false, ['amount']],
    ])
    designer.execute([{ type: 'updateCard', id: 'b', changes: [{ path: ['title'] }] }])
    await designer.updateComplete
    expect(outline.nodes![2]!.label).toBe(`${t.cardTypes.metric} · b`)
  })

  it('页面结构跟着画布的选择：选中卡片或列表项，大纲选中那一行；点一行选中它并让卡片可见，悬停或聚焦到一行标出它所在的卡片', async () => {
    const designer = await mount()
    placeGrid(designer)
    const outline = designer.querySelector('xh-designer-outline')!
    const overlay = designer.querySelector('xh-designer-transform')!
    designer.select({ cards: ['a'] })
    await designer.updateComplete
    expect(outline.selection).toEqual([JSON.stringify(['card', 'a'])])
    const item = JSON.stringify(['item', 'pie', 'measures', 'amount'])
    outline.dispatchEvent(new CustomEvent('node-select', { detail: { ids: [item] } }))
    expect(designer.getSelection()).toEqual({ cards: ['pie'], item: { card: 'pie', list: 'measures', id: 'amount' } })
    await designer.updateComplete
    expect(outline.selection).toEqual([item])
    outline.dispatchEvent(new CustomEvent('node-select', { detail: { ids: [JSON.stringify(['card', 'b'])] } }))
    expect(designer.getSelection()).toEqual({ cards: ['b'] })
    outline.dispatchEvent(new CustomEvent('node-highlight', { detail: { id: item } }))
    expect(overlay.hover).toMatchObject({ x: 0, y: 0, width: 400, height: 160 })
    outline.dispatchEvent(new CustomEvent('node-highlight', { detail: { id: null } }))
    expect(overlay.hover).toBeUndefined()
  })

  it('页面结构里删除一行走设计器的删除；列表项能在同一列表里换序，交叉表的行与列之间能互换，别的列表与别的卡片不许', async () => {
    const designer = await mount()
    const outline = designer.querySelector('xh-designer-outline')!
    const id = (...parts: (string | null)[]): string => JSON.stringify(parts)
    outline.dispatchEvent(new CustomEvent('node-delete', { detail: { ids: [id('item', 'pie', 'measures', 'amount')] } }))
    expect(cards(designer)[0]).toMatchObject({ query: { measures: [] } })
    designer.undo()
    designer.execute([{ type: 'addItem', card: 'pie', list: 'dimensions', item: { id: 'r2', field: 'region' } }])
    await designer.updateComplete
    const allow = outline.allowMove!
    expect(allow({ id: id('item', 'pie', 'dimensions', 'r2'), parent: id('list', 'pie', 'dimensions'), index: 0 })).toBe(true)
    expect(allow({ id: id('item', 'pie', 'dimensions', 'r2'), parent: id('list', 'pie', 'measures'), index: 0 })).toBe(false)
    expect(allow({ id: id('item', 'pie', 'dimensions', 'r2'), parent: id('list', 'a', 'dimensions'), index: 0 })).toBe(false)
    outline.dispatchEvent(new CustomEvent('node-move', { detail: { id: id('item', 'pie', 'dimensions', 'r2'), parent: id('list', 'pie', 'dimensions'), index: 0 } }))
    expect((cards(designer)[0] as unknown as { query: { dimensions: { id: string }[] } }).query.dimensions.map(item => item.id)).toEqual(['r2', 'region'])
    designer.schema = { ...board, body: { type: 'crosstab', dataset: 'sales', rows: [{ id: 'region', field: 'region' }], columns: [], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] } }
    await designer.updateComplete
    expect(outline.nodes!.map(node => [node.label, node.deletable, node.children!.map(list => list.label)])).toEqual([[DEFAULT_REPORT_DESIGNER_TRANSLATIONS.cardTypes['table.crosstab'], false, ['Rows', 'Columns', 'Measures'].map(() => expect.any(String))]])
    expect(allow({ id: id('item', null, 'rows', 'region'), parent: id('list', null, 'columns'), index: 0 })).toBe(true)
    expect(allow({ id: id('item', null, 'measures', 'amount'), parent: id('list', null, 'rows'), index: 0 })).toBe(false)
    outline.dispatchEvent(new CustomEvent('node-move', { detail: { id: id('item', null, 'rows', 'region'), parent: id('list', null, 'columns'), index: 0 } }))
    expect(designer.schema!.body).toMatchObject({ rows: [], columns: [{ id: 'region' }] })
    designer.readonly = true
    await designer.updateComplete
    expect([outline.readonly, outline.allowMove]).toEqual([true, undefined])
  })

  it('页面结构多选：卡片可以多选、列表项一次一个，整份换上树交来的选中，空数组全部取消；只把新选上的卡片滚进可见区', async () => {
    const designer = await mount()
    const outline = designer.querySelector('xh-designer-outline')!
    const reveal = vi.spyOn(designer, 'revealCard')
    const id = (...parts: (string | null)[]): string => JSON.stringify(parts)
    const pick = async (...ids: string[]): Promise<void> => {
      outline.dispatchEvent(new CustomEvent('node-select', { detail: { ids } }))
      await designer.updateComplete
    }
    const revealed = (): string[] => reveal.mock.calls.map(call => call[0])
    await pick(id('card', 'a'))
    await pick(id('card', 'a'), id('card', 'b'))
    expect([designer.getSelection(), revealed(), outline.selection]).toEqual([{ cards: ['a', 'b'] }, ['a', 'b'], [id('card', 'a'), id('card', 'b')]])
    await pick(id('card', 'b'))
    expect([designer.getSelection(), revealed()]).toEqual([{ cards: ['b'] }, ['a', 'b']])
    await pick(id('card', 'b'), id('item', 'pie', 'measures', 'amount'))
    expect([designer.getSelection(), revealed().at(-1)]).toEqual([{ cards: ['pie'], item: { card: 'pie', list: 'measures', id: 'amount' } }, 'pie'])
    await pick()
    expect(designer.getSelection()).toEqual({ cards: [] })
    await pick(id('card', 'pie'), id('item', 'pie', 'dimensions', 'region'), id('card', 'a'))
    expect([designer.getSelection(), revealed().at(-1)]).toEqual([{ cards: ['pie', 'a'] }, 'pie'])
  })

  it('导入的入口在数据集与报表参数两块卡片的面板头，按 datasetEditing 出现：fields 只能导入参数，full 还能导入数据集与字段；只读时都没有', async () => {
    const designer = await mount()
    const button = (region: string, command: string): HTMLButtonElement | null => designer.querySelector(`[data-region="${region}"] button[value="${command}"]`)
    expect([button('datasets', 'import-dataset'), button('datasets', 'import-fields'), button('parameters', 'import-parameters') !== null]).toEqual([null, null, true])
    designer.datasetEditing = 'full'
    await designer.updateComplete
    expect([button('datasets', 'import-dataset')!.disabled, button('datasets', 'import-fields')!.disabled]).toEqual([false, true])
    designer.select({ data: { kind: 'field', dataset: 'sales', name: 'amount' } })
    await designer.updateComplete
    expect([designer.canImportData('fields'), button('datasets', 'import-fields')!.disabled]).toEqual([true, false])
    designer.readonly = true
    await designer.updateComplete
    expect([button('datasets', 'import-dataset'), button('parameters', 'import-parameters'), designer.openDataImport('parameters')]).toEqual([null, null, false])
  })

  it('导入数据集、字段与参数：对话框按目的打开，交来的字段换成一批操作记一步撤销；导入数据集后选中新数据集，导入字段只加还没有的', async () => {
    const designer = await mount()
    designer.datasetEditing = 'full'
    await designer.updateComplete
    const dialog = designer.querySelector('xh-designer-field-import')!
    const t = DEFAULT_REPORT_DESIGNER_TRANSLATIONS
    const send = (sample: unknown, annotations = new Map()): void => {
      dialog.dispatchEvent(new CustomEvent('fields-import', { detail: { fields: inferDataFields(sample as never).fields, mode: 'replace', source: 'sample', annotations } }))
    }
    expect(designer.openDataImport('dataset')).toBe(true)
    expect([dialog.open, dialog.source, dialog.translations?.title, dialog.offerSample]).toEqual([true, 'sample', t.importDataset, false])
    send([{ city: '杭州', qty: 2 }])
    expect(designer.schema!.datasets.map(dataset => [dataset.id, dataset.fields.map(field => `${field.name}:${field.type}`)])).toEqual([['sales', ['region:string', 'amount:number']], ['dataset1', ['city:string', 'qty:number']]])
    expect(designer.getSelection().data).toEqual({ kind: 'dataset', dataset: 'dataset1' })
    expect(designer.historyState.entries).toHaveLength(1)
    designer.select({ data: { kind: 'dataset', dataset: 'sales' } })
    designer.openDataImport('fields')
    expect(dialog.translations).toBeUndefined()
    send({ region: '华东', margin: 0.2 })
    expect(designer.schema!.datasets[0]!.fields.map(field => field.name)).toEqual(['region', 'amount', 'margin'])
    designer.openDataImport('parameters')
    expect([dialog.source, dialog.translations?.title]).toEqual(['json-schema', t.importParameters])
    send({ year: 2026 }, new Map([['year', { required: true }]]))
    expect(designer.schema!.parameters).toEqual([{ name: 'year', type: 'number', required: true }])
    designer.undo()
    designer.undo()
    designer.undo()
    expect(designer.schema).toEqual(board)
    send({ late: 1 })
    expect(designer.schema).toEqual(board)
  })

  it('选中框下方常驻尺寸徽标，按格计：像素与格数按网格逐轴换算，单位文字随语言；改宽高按格改卡片，连续步进合成一步撤销，输入的单独一步', async () => {
    const designer = await mount()
    placeGrid(designer)
    designer.select({ cards: ['a'] })
    await designer.updateComplete
    const overlay = designer.querySelector('xh-designer-transform')!
    expect([overlay.measure, overlay.measureOptions?.unitLabel, overlay.measureOptions?.fractionDigits]).toEqual(['selection', 'cells', 0])
    // placeGrid 的网格：列距 100、行距 40，没有间隙
    const convert = overlay.measureOptions!.convert!
    expect([convert.toDisplay(400, 'width'), convert.toDisplay(80, 'height'), convert.toModel(5, 'width'), convert.toModel(3, 'height')]).toEqual([4, 2, 500, 120])
    const change = (axis: 'width' | 'height', width: number, height: number, source: 'step' | 'input'): void => {
      overlay.dispatchEvent(new CustomEvent('measure-change', { detail: { id: 'a', axis, source, rect: { x: 400, y: 0, width, height } } }))
    }
    change('width', 500, 80, 'step')
    change('width', 600, 80, 'step')
    expect(cards(designer).find(item => item.id === 'a')!.layout).toMatchObject({ w: 6, h: 2 })
    expect(designer.historyState.entries).toHaveLength(1)
    change('height', 600, 120, 'input')
    expect([cards(designer).find(item => item.id === 'a')!.layout.h, designer.historyState.entries.length]).toEqual([3, 2])
    designer.undo()
    designer.undo()
    expect(designer.schema).toEqual(board)
    designer.readonly = true
    await designer.updateComplete
    change('width', 500, 80, 'input')
    expect(designer.schema).toEqual(board)
    try {
      setXhConfig(reportZhCN)
      designer.requestUpdate()
      await designer.updateComplete
      expect(overlay.measureOptions!.unitLabel).toBe('格')
    }
    finally {
      setXhConfig({})
    }
  })

  it('按 Alt+F10 把焦点交给选中工具条，工具条排列为空时交给尺寸徽标；在里面按 Esc 回到画布', async () => {
    const designer = await mount()
    placeGrid(designer)
    designer.select({ cards: ['a'] })
    await designer.updateComplete
    const scroller = designer.querySelector<HTMLElement>('[data-part="scroller"]')!
    scroller.focus()
    key(designer, 'F10', { altKey: true })
    const toolbar = designer.querySelector('xh-designer-transform [data-part="toolbar"]')!
    expect(toolbar.contains(document.activeElement)).toBe(true)
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(scroller)
    designer.commandLayout = { 'selection:card': [] }
    await designer.updateComplete
    key(designer, 'F10', { altKey: true })
    expect(document.activeElement!.closest('[data-part="measure-field"][data-axis="width"]')).not.toBeNull()
  })

  it('新手引导：缺省在第一次铺好画布、设计器显示出来（画布有宽度）后自动开始，只开一次，欢迎之后是菜单栏一步，通用步骤之后接报表的几步，设置一步落在「文件」菜单；收起时设置里记下 help.tourDone，记过的不再自动开始；autoTour 为 false 时不自动开始，startTour() 照样能开始', async () => {
    const settle = async (element: XhReportDesigner): Promise<void> => {
      await element.updateComplete
      await element.updateComplete
    }
    // jsdom 不排版：给画布一个宽度，当作设计器显示着
    const show = async (element: XhReportDesigner): Promise<XhReportDesigner> => {
      Object.defineProperty(element.querySelector('[data-part="canvas"]')!, 'clientWidth', { configurable: true, value: 800 })
      element.requestUpdate()
      await settle(element)
      return element
    }
    const create = async (setup: (element: XhReportDesigner) => void): Promise<XhReportDesigner> => {
      const element = document.createElement('xh-report-designer')
      setup(element)
      element.schema = board
      document.body.append(element)
      await settle(element)
      return show(element)
    }
    const hidden = document.createElement('xh-report-designer')
    hidden.schema = board
    document.body.append(hidden)
    await settle(hidden)
    expect(hidden.querySelector('xh-designer-tour')!.running).toBe(false)
    await show(hidden)
    expect(hidden.querySelector('xh-designer-tour')!.running).toBe(true)
    hidden.querySelector('xh-designer-tour')!.stop()
    hidden.requestUpdate()
    await settle(hidden)
    expect(hidden.querySelector('xh-designer-tour')!.running).toBe(false)
    document.body.replaceChildren()
    const designer = await create(() => {})
    const tour = designer.querySelector('xh-designer-tour')!
    expect(tour.running).toBe(true)
    expect(tour.steps!.map(step => step.id)).toEqual(['report.datasets', 'report.data', 'report.wells', 'report.cards', 'report.links', 'report.preview'])
    expect(tour.steps![0]).toMatchObject({ title: DEFAULT_REPORT_DESIGNER_TRANSLATIONS.tourSteps.datasets.title, target: { panel: 'datasets' } })
    const planned = tour.plannedSteps()
    expect(planned.map(step => step.id).slice(0, 3)).toEqual(['shell.welcome', 'shell.menubar', 'shell.toolbar'])
    expect(planned.map(step => step.id)).toEqual(expect.arrayContaining(['report.datasets', 'report.data', 'report.cards', 'report.preview']))
    expect(planned.at(-1)).toMatchObject({ id: 'shell.settings', target: { menubar: 'file' } })
    const changes = events(designer, 'settings-change')
    tour.stop()
    expect(changes).toEqual([{ key: 'help.tourDone', value: true, settings: { 'help.tourDone': true } }])
    document.body.replaceChildren()
    const done = await create(element => (element.settings = { 'help.tourDone': true }))
    expect(done.querySelector('xh-designer-tour')!.running).toBe(false)
    const quiet = await create(element => (element.autoTour = false))
    expect(quiet.querySelector('xh-designer-tour')!.running).toBe(false)
    expect(quiet.startTour()).toBe(true)
    expect(quiet.querySelector('xh-designer-tour')!.running).toBe(true)
  })

  it('报表的引导步骤：数据面板之后是「数据」菜单一步，讲导入数据集、字段与参数，登记了导入器时带上导入模板；预览一步的说明带上「视图」菜单；设置一步只落在「文件」菜单', async () => {
    const t = DEFAULT_REPORT_DESIGNER_TRANSLATIONS.tourSteps
    const designer = await mount()
    const frame = designer.querySelector('xh-designer-frame')!
    await frame.updateComplete
    const tour = designer.querySelector('xh-designer-tour')!
    const step = (id: string): { target?: unknown, order?: number, title: string, description: string } => tour.steps!.find(item => item.id === id)!
    expect([step('report.data').target, step('report.data').order, step('report.data').title, step('report.data').description]).toEqual([{ menubar: 'data' }, 105, t.data.title, t.data.description])
    expect([t.data.description, t.data.templateDescription, t.preview.description]).toEqual([expect.stringContaining('Data menu'), expect.stringContaining('Import template'), expect.stringContaining('View menu')])
    expect([step('report.preview').description, 'menubarDescription' in t.preview]).toEqual([t.preview.description, false])
    designer.extensions = [{ id: '@acme/templates', importers: [{ id: '@acme/templates.json', accepts: () => true, import: () => undefined }] }]
    await designer.updateComplete
    expect(step('report.data').description).toBe(t.data.templateDescription)
    designer.settings = { 'toolbar.menubar': false }
    await designer.updateComplete
    await frame.updateComplete
    const planned = tour.plannedSteps()
    expect(planned.map(item => item.id).filter(id => id === 'shell.menubar' || id === 'report.data')).toEqual(['shell.menubar', 'report.data'])
    expect(planned.filter(item => item.id === 'shell.settings').map(item => item.target)).toEqual([{ menubar: 'file' }])
  })

  it('同一页只开一个新手引导：别的设计器的引导开着时，startTour()（start-tour 命令与帮助页的「开始引导」都走它）先收起那一个再开始', async () => {
    const create = async (autoTour: boolean): Promise<XhReportDesigner> => {
      const element = document.createElement('xh-report-designer')
      element.autoTour = autoTour
      element.schema = board
      document.body.append(element)
      await element.updateComplete
      // jsdom 不排版：给画布一个宽度，当作设计器显示着
      Object.defineProperty(element.querySelector('[data-part="canvas"]')!, 'clientWidth', { configurable: true, value: 800 })
      element.requestUpdate()
      await element.updateComplete
      await element.updateComplete
      return element
    }
    const first = await create(true)
    const second = await create(false)
    const running = (): boolean[] => [first, second].map(element => element.querySelector('xh-designer-tour')!.running)
    expect(running()).toEqual([true, false])
    expect(second.startTour()).toBe(true)
    expect(running()).toEqual([false, true])
  })

  it('工具栏的容器部件叫 command-bar：设计器自己不再有 toolbar 部件，变换覆盖层的上下文工具条不会被它的样式连带命中', async () => {
    const designer = await mount()
    expect(designer.querySelector('[data-region="toolbar"] > [data-part="command-bar"]')).not.toBeNull()
    expect([...designer.querySelectorAll('[data-part="toolbar"]')].filter(node => !node.closest('xh-designer-transform'))).toEqual([])
  })

  it('工具栏缺省只显示图标：内置命令都带图标，名字与快捷键写在按钮上（重做另认 Ctrl+Y），删除按危险语气；共用命令的文案取 designer-shell 的命令文案，菜单栏的数据菜单名取报表的文案', async () => {
    const designer = await mount()
    const buttons = (): HTMLButtonElement[] => [...designer.querySelectorAll<HTMLButtonElement>('[data-region="toolbar"] button[value]')]
    const button = (command: string): HTMLButtonElement => buttons().find(item => item.value === command)!
    expect(designer.querySelector('[data-region="toolbar"] [data-display]')!.getAttribute('data-display')).toBe('icon')
    expect(buttons().filter(item => !item.hasAttribute('data-icon')).map(item => item.value)).toEqual([])
    expect(buttons().filter(item => item.dataset.tone === 'danger').map(item => item.value)).toEqual(['delete'])
    expect([button('undo').getAttribute('aria-label'), button('redo').getAttribute('aria-keyshortcuts')]).toEqual(['Undo', expect.stringMatching(/^(?:Control|Meta)\+Shift\+Z Control\+Y$/)])
    try {
      setXhConfig(reportZhCN)
      designer.requestUpdate()
      await designer.updateComplete
      expect(buttons().map(item => item.getAttribute('aria-label'))).toEqual(['撤销', '重做', '剪切', '复制', '粘贴', '创建副本', '删除', '拖动', '缩小', '放大', '适合窗口', '实际大小', '设计', '预览', '面板'])
      expect(designer.querySelector('[data-region="toolbar"] [aria-label="设计器操作"]')).not.toBeNull()
      expect(designer.querySelector<MenubarHost>('xh-menubar')!.collection!.map(node => node.label)).toEqual(['文件', '编辑', '视图', '数据', '帮助'])
      expect(designer.querySelector('xh-designer-frame')!.regions?.find(region => region.name === 'toolbar')?.label).toBe('设计器操作')
    }
    finally {
      setXhConfig({})
    }
  })

  it('内建菜单建好时填空白处的条目；右键事件不取消时按落点重填：卡片上与空白处各一套，不可用的写 aria-disabled，选中条目执行命令（开发者模式开着，空白处末尾是编辑 JSON）', async () => {
    const designer = await mount({ settings: DEVELOPER })
    const content = designer.querySelector('xh-context-menu [data-xh-part="positioner"] > [data-xh-part="content"]')!
    const entries = (): [string | null, boolean][] => [...content.querySelectorAll('[data-xh-part="item"]')].map(item => [item.getAttribute('value'), item.getAttribute('aria-disabled') === 'true'])
    expect(entries()).toEqual([['paste', true], ['select-all', false], ['zoom-to-fit', false], ['edit-json', false]])
    card(designer, 'a').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(designer.getSelection()).toEqual({ cards: ['a'] })
    expect(entries()).toEqual([['cut', false], ['copy', false], ['paste', true], ['duplicate', false], ['delete', false]])
    expect(content.querySelector('[data-xh-part="item"][value="cut"]')!.textContent).toBe('Cut')
    expect([...content.querySelectorAll('[data-xh-part="item"]')].filter(item => !item.querySelector('[data-xh-part="item-icon"] xh-icon')).map(item => item.getAttribute('value'))).toEqual([])
    expect(content.querySelector('[data-xh-part="item"][value="delete"]')!.getAttribute('data-tone')).toBe('danger')
    designer.querySelector('xh-context-menu')!.dispatchEvent(new CustomEvent('item-select', { detail: { value: 'delete' } }))
    expect(cards(designer).map(item => item.id)).toEqual(['pie', 'b'])
    designer.querySelector('[data-part="surface"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(entries()).toEqual([['paste', true], ['select-all', false], ['zoom-to-fit', false], ['edit-json', false]])
    designer.addEventListener('card-contextmenu', event => event.preventDefault())
    card(designer, 'b').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(entries()).toEqual([['paste', true], ['select-all', false], ['zoom-to-fit', false], ['edit-json', false]])
  })

  it('画布里的输入框（尺寸徽标）选中文字时派发的原生 select 事件冒泡到右键菜单，不当成选了菜单条目', async () => {
    const designer = await mount()
    designer.select({ cards: ['a'] })
    await designer.updateComplete
    const errors: unknown[] = []
    const onError = (event: ErrorEvent): void => {
      errors.push(event.error)
      event.preventDefault()
    }
    window.addEventListener('error', onError)
    try {
      const input = designer.querySelector('xh-context-menu [data-part="canvas"] input') ?? designer.querySelector('[data-part="canvas"]')!
      input.dispatchEvent(new Event('select', { bubbles: true }))
    }
    finally {
      window.removeEventListener('error', onError)
    }
    expect(errors).toEqual([])
    expect(cards(designer).map(item => item.id)).toEqual(['pie', 'a', 'b'])
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

  it('版式交给外框：设置里的布局、defaultLayout 与 settingsPolicy 换算的管控原样转交，画布总是显示；右键事件可以取消', async () => {
    const designer = await mount()
    const frame = designer.querySelector('xh-designer-frame')!
    expect(frame.querySelector('[data-part="region"][data-region="canvas"] [data-part="canvas"]')).not.toBeNull()
    const panels = Object.values(REPORT_DESIGNER_PANELS)
    const defaults = { version: 1, hidden: ['issues', 'wells'] } as const
    designer.defaultLayout = defaults
    await designer.updateComplete
    expect(frame.defaultLayout).toBe(defaults)
    expect(panels.filter(name => !frame.showsPanel(name))).toEqual(['wells', 'issues'])
    const stored = { version: 1, hidden: [...panels] } as const
    designer.settings = { [DESIGNER_SETTING_KEYS.layout]: stored }
    await designer.updateComplete
    expect(frame.layout).toBe(stored)
    expect(panels.filter(name => frame.showsPanel(name))).toEqual([])
    expect(frame.querySelector('[data-region="canvas"] [data-part="canvas"]')).not.toBeNull()
    designer.settings = {}
    designer.settingsPolicy = { [`${DESIGNER_SETTING_KEYS.layout}.palette`]: 'hidden', [`${DESIGNER_SETTING_KEYS.layout}.issues`]: 'locked' }
    await designer.updateComplete
    expect(frame.layoutPolicy).toEqual({ panels: { palette: 'hidden', issues: 'locked' } })
    const policy = frame.layoutPolicy
    designer.settingsPolicy = { ...designer.settingsPolicy }
    await designer.updateComplete
    expect(frame.layoutPolicy).toBe(policy)
    expect([frame.showsPanel('palette'), frame.panelEntries().find(entry => entry.name === 'issues')?.locked]).toEqual([false, true])
    designer.addEventListener('card-contextmenu', event => event.preventDefault())
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    card(designer, 'a').dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
    expect(designer.getSelection()).toEqual({ cards: ['a'] })
  })
})

describe('<xh-report-designer>：编辑 JSON', () => {
  function jsonEditor(designer: XhReportDesigner): XhDesignerJsonEditorElement {
    return designer.querySelector('xh-designer-json-editor')!
  }

  function apply(designer: XhReportDesigner, value: unknown): void {
    jsonEditor(designer).dispatchEvent(new CustomEvent('json-apply', { detail: { value }, bubbles: true }))
  }

  it('开发者模式开着时按 Ctrl / ⌘ + Shift + J 打开对话框，写出当前报表；空白处右键菜单的末尾也是这一条', async () => {
    const designer = await mount({ settings: DEVELOPER })
    key(designer, 'J', { ctrlKey: true, shiftKey: true })
    await designer.updateComplete
    const dialog = jsonEditor(designer)
    expect([dialog.open, dialog.value, dialog.readonly]).toEqual([true, designer.schema, false])
    expect(REPORT_MENU_LAYOUT.blank.at(-1)).toEqual(['edit-json'])
  })

  it('开发者模式关着（缺省）时没有编辑 JSON：菜单栏、空白处右键菜单与快捷键表都不列，Ctrl / ⌘ + Shift + J 不打开；openJsonEditor() 照样能打开', async () => {
    const designer = await mount()
    expect(menubarItems(designer, 'edit')).not.toContain('edit-json')
    const content = designer.querySelector('xh-context-menu [data-xh-part="positioner"] > [data-xh-part="content"]')!
    expect([...content.querySelectorAll('[data-xh-part="item"]')].map(item => item.getAttribute('value'))).toEqual(['paste', 'select-all', 'zoom-to-fit'])
    const shortcuts = designer.querySelector<HTMLElement & { shortcuts?: { groups: readonly { rows: readonly { label: string }[] }[] } }>('xh-designer-settings')!.shortcuts!
    expect(shortcuts.groups.flatMap(group => group.rows.map(row => row.label))).not.toContain(DESIGNER_COMMANDS_EN_US.editJson)
    const press = new KeyboardEvent('keydown', { key: 'J', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
    designer.querySelector('[data-part="scroller"]')!.dispatchEvent(press)
    await designer.updateComplete
    expect([press.defaultPrevented, jsonEditor(designer).open]).toEqual([false, false])
    expect(designer.openJsonEditor()).toBe(true)
    expect(jsonEditor(designer).open).toBe(true)
  })

  it('按当前扩展与表达式引擎校验：问题的说明与所在对象的名字同问题列表；缺了对象或形状不对的 JSON 也只报问题、不抛错', async () => {
    const designer = await mount()
    designer.openJsonEditor()
    const validate = jsonEditor(designer).validate!
    expect(validate(designer.schema as unknown as JsonValue)).toEqual([])
    const broken = structuredClone(board) as unknown as { body: { cards: { query: { dimensions: { field: string }[] } }[] } }
    broken.body.cards[0]!.query.dimensions[0]!.field = 'nope'
    const unknown = validate(broken as unknown as JsonValue).find(item => item.issue.code === 'unknown-field')!
    expect([unknown.subject, unknown.message]).toEqual(['各区域', DEFAULT_REPORT_DESIGNER_TRANSLATIONS.issue(unknown.issue as ValidationIssue)])
    const fieldless = validate({ schemaVersion: 1, id: 'x', datasets: [{ id: 'd' }] })
    expect(fieldless.map(item => [formatJsonPath(item.issue.path), item.subject])).toEqual(expect.arrayContaining([['datasets[0].fields', 'd'], ['body', undefined]]))
    for (const value of [null, [], { datasets: 'x', parameters: 'p', body: 5 }, { body: { type: 'dashboard', cards: [{ id: 'c', kind: 'table', view: 3 }, 7], links: [7] } }] as JsonValue[])
      expect(validate(value).length).toBeGreaterThan(0)
  })

  it('应用时整份换上，记一步撤销，说明是「编辑 JSON」，派发一次 schema-change 并清空选择；撤销回到原来那份', async () => {
    const designer = await mount()
    const before = designer.schema!
    designer.select({ cards: ['a'] })
    const changes = events(designer, 'schema-change') as { kind: string }[]
    apply(designer, { ...structuredClone(before), title: '改过', body: { ...(before.body as DashboardView), cards: cards(designer).filter(item => item.id !== 'b') } })
    await designer.updateComplete
    expect([designer.schema!.title, cards(designer).map(item => item.id), changes.map(change => change.kind), designer.getSelection()]).toEqual(['改过', ['pie', 'a'], ['execute'], { cards: [] }])
    expect(designer.historyState.entries.at(-1)!.label).toBe(DESIGNER_COMMANDS_EN_US.editJson)
    expect(designer.undo()).toBe(true)
    expect(designer.schema).toEqual(before)
  })

  it('只读或预览态只能看：对话框只读，应用不改报表；还没有报表时不打开', async () => {
    const designer = await mount()
    const before = designer.schema
    const changed = { ...structuredClone(before!), title: '改过' }
    designer.readonly = true
    await designer.updateComplete
    expect(designer.openJsonEditor()).toBe(true)
    expect(jsonEditor(designer).readonly).toBe(true)
    apply(designer, changed)
    expect(designer.schema).toBe(before)
    designer.readonly = false
    designer.mode = 'preview'
    await designer.updateComplete
    designer.openJsonEditor()
    expect(jsonEditor(designer).readonly).toBe(true)
    apply(designer, changed)
    expect(designer.schema).toBe(before)
    const empty = document.createElement('xh-report-designer')
    empty.autoTour = false
    document.body.append(empty)
    await empty.updateComplete
    expect([empty.openJsonEditor(), jsonEditor(empty).open]).toEqual([false, false])
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
    expect(groups).toContainEqual(['pan-tool', 'zoom-out', 'zoom-in', 'zoom-to-fit', 'zoom-to-actual'])
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

  it('拖动工具 pan-tool 与缩放同组、带手形图标：点它或按 H 切换外框的 canvasTool，按下态跟着外框的 canvas-tool-change 重画', async () => {
    const designer = await mount()
    const frame = designer.querySelector('xh-designer-frame')!
    const pan = toolbarButton(designer, 'pan-tool')
    expect([pan.hasAttribute('data-icon'), pan.getAttribute('aria-pressed'), frame.canvasTool]).toEqual([true, 'false', 'select'])
    pan.click()
    await designer.updateComplete
    expect([frame.canvasTool, pan.getAttribute('aria-pressed')]).toEqual(['pan', 'true'])
    frame.canvasTool = 'select'
    await designer.updateComplete
    expect(pan.getAttribute('aria-pressed')).toBe('false')
    key(designer, 'h')
    await designer.updateComplete
    expect([frame.canvasTool, pan.getAttribute('aria-pressed')]).toEqual(['pan', 'true'])
  })

  it('拖动工具开着：在卡片或空白处按住拖动都是平移，不选中、不挪卡片，只点一下不清掉选中，双击不派发 card-dblclick；拖动途中 Esc 只取消这一次，不在拖动时 Esc 交给外框退出拖动工具', async () => {
    const designer = await mount()
    placeGrid(designer)
    const frame = designer.querySelector('xh-designer-frame')!
    const canvas = designer.querySelector<HTMLElement>('[data-part="canvas"]')!
    const scroller = designer.querySelector<HTMLElement>('[data-part="scroller"]')!
    let left = 0
    let top = 0
    Object.defineProperty(scroller, 'scrollLeft', { configurable: true, get: () => left, set: (value: number) => (left = value) })
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => top, set: (value: number) => (top = value) })
    const pointer = (target: EventTarget, type: string, x: number, y: number): void => {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: x, clientY: y }))
    }
    designer.select({ cards: ['b'] })
    frame.canvasTool = 'pan'
    await designer.updateComplete
    expect(designer.querySelector('xh-designer-transform')!.readonly).toBe(true)
    const before = structuredClone(cards(designer))
    pointer(card(designer, 'a'), 'pointerdown', 450, 30)
    expect(canvas.dataset.gesture).toBe('pan')
    pointer(document, 'pointermove', 400, 10)
    pointer(document, 'pointerup', 400, 10)
    expect([left, top, designer.getSelection(), cards(designer), canvas.dataset.gesture]).toEqual([50, 20, { cards: ['b'] }, before, undefined])
    pointer(designer.querySelector('[data-part="surface"]')!, 'pointerdown', 600, 700)
    pointer(document, 'pointerup', 600, 700)
    expect([left, top, designer.getSelection()]).toEqual([50, 20, { cards: ['b'] }])
    const dblclicks = events(designer, 'card-dblclick')
    card(designer, 'a').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(dblclicks).toEqual([])
    pointer(card(designer, 'a'), 'pointerdown', 450, 30)
    pointer(document, 'pointermove', 420, 30)
    expect(left).toBe(80)
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    scroller.dispatchEvent(escape)
    expect([escape.defaultPrevented, left, top, frame.canvasTool, canvas.dataset.gesture]).toEqual([true, 50, 20, 'pan', undefined])
    pointer(document, 'pointermove', 300, 30)
    pointer(document, 'pointerup', 300, 30)
    expect(left).toBe(50)
    key(designer, 'Escape')
    await designer.updateComplete
    expect([frame.canvasTool, designer.getSelection(), designer.querySelector('xh-designer-transform')!.readonly]).toEqual(['select', { cards: ['b'] }, false])
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

  it('打开时按实际大小：缩放 100%，看板左上角在可见区里；内容比可见区高、尺寸变了或换一份报表都不自动适合窗口', async () => {
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
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => 500 })
    Object.defineProperty(content, 'offsetHeight', { configurable: true, get: () => 2000 })
    observers.forEach(callback => callback())
    const zoomStatus = designer.querySelector('[slot="status-end"]')!.textContent
    expect([zoom(designer), scroller.scrollLeft, scroller.scrollTop, zoomStatus]).toEqual([1, 0, 0, expect.stringContaining('100%')])
    designer.schema = { ...board, id: 'other' }
    await designer.updateComplete
    observers.forEach(callback => callback())
    expect(zoom(designer)).toBe(1)
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

describe('<xh-report-designer>：物料来源', () => {
  interface Inserted {
    readonly item: string
    readonly designer: unknown
    readonly at?: unknown
  }

  function sourced(log: Inserted[], id = 'mine'): ReportDesignerExtension {
    return {
      id: `@acme/${id}`,
      paletteSources: [{
        id: `@acme/${id}.saved`,
        groups: () => [{ id: `${id}.saved`, label: 'Saved', items: [{ id: `${id}.kpi`, label: 'Saved KPI', payload: { template: 'kpi' }, children: [{ id: `${id}.kpi.small`, label: 'Small' }] }] }],
        insert: (item, context, at) => void log.push(at === undefined ? { item: item.id, designer: context.designer } : { item: item.id, designer: context.designer, at }),
      }],
    }
  }

  function pointer(target: EventTarget, type: string, x: number, y: number): void {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: x, clientY: y }))
  }

  it('分组接在内置物料组后面；点按来源的条目（含下级）交给来源插入、不给落点，内置条目照旧新建卡片；只读时不交给来源', async () => {
    const designer = await mount()
    const log: Inserted[] = []
    designer.extensions = [sourced(log)]
    await designer.updateComplete
    const palette = designer.querySelector('xh-designer-palette')!
    expect(palette.groups!.map(group => group.id)).toEqual(['charts', 'metrics', 'tables', 'mine.saved'])
    palette.dispatchEvent(new CustomEvent('item-activate', { detail: { id: 'mine.kpi.small', payload: undefined } }))
    expect([log, cards(designer).length]).toEqual([[{ item: 'mine.kpi.small', designer }], 3])
    palette.dispatchEvent(new CustomEvent('item-activate', { detail: { id: 'metric', payload: 'metric' } }))
    expect([log.length, cards(designer).length]).toEqual([1, 4])
    designer.readonly = true
    await designer.updateComplete
    palette.dispatchEvent(new CustomEvent('item-activate', { detail: { id: 'mine.kpi', payload: { template: 'kpi' } } }))
    expect(log).toHaveLength(1)
  })

  it('拖到看板上：落点画出指针所在的那一格，放下时交给来源插入并带上落点格；只读时不接收', async () => {
    const designer = await mount()
    const log: Inserted[] = []
    designer.extensions = [sourced(log)]
    await designer.updateComplete
    placeGrid(designer)
    const scroller = designer.querySelector<HTMLElement>('[data-part="scroller"]')!
    stub(scroller, { x: 0, y: 0, width: 1200, height: 800 })
    document.elementFromPoint = () => scroller
    const source = document.createElement('button')
    document.body.append(source)
    source.addEventListener('pointerdown', event => startDrag(event, { payload: { source: 'palette', id: 'mine.kpi', payload: { template: 'kpi' } } satisfies DesignerPaletteDragPayload }))
    const drag = (x: number, y: number): void => {
      pointer(source, 'pointerdown', 10, 10)
      pointer(document, 'pointermove', x, y)
    }
    drag(475, 70)
    const preview = designer.querySelector<HTMLElement>('[data-part="drop-preview"]')!
    expect([preview.hidden, preview.style.insetInlineStart, preview.style.insetBlockStart, preview.style.inlineSize, preview.style.blockSize]).toEqual([false, '400px', '40px', '100px', '40px'])
    pointer(document, 'pointerup', 475, 70)
    expect([log, cards(designer).length, preview.hidden]).toEqual([[{ item: 'mine.kpi', designer, at: { x: 4, y: 1 } }], 3, true])
    designer.readonly = true
    await designer.updateComplete
    drag(475, 70)
    expect(preview.hidden).toBe(true)
    pointer(document, 'pointerup', 475, 70)
    expect(log).toHaveLength(1)
  })

  it('物料来源 id 重名时抛 DesignerExtensionError，扩展不变', async () => {
    const designer = await mount()
    const log: Inserted[] = []
    const first = sourced(log, 'a')
    designer.extensions = [first]
    expect(() => (designer.extensions = [first, { id: '@acme/b', paletteSources: first.paletteSources! }])).toThrow(DesignerExtensionError)
    expect(designer.extensions).toEqual([first])
  })
})

describe('<xh-report-designer>：调试日志', () => {
  it('开发者模式与渲染日志都开着时，每次重画记一组「[xh-report-designer] render · update: 改动的属性」带耗时，画布上卡片的取数、计算与出图各记一组；报表没有分页，分页日志开着也不记；关掉开发者模式就不记', async () => {
    const groups = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {})
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const titles = (): string[] => groups.mock.calls.map(call => String(call[0]))
    const designer = await mount({ provider: () => {}, settings: { ...DEVELOPER, [DESIGNER_SETTING_KEYS.debugRender]: true, [DESIGNER_SETTING_KEYS.debugPagination]: true } })
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(titles().some(title => title.startsWith('[xh-report-designer] render · update: '))).toBe(true)
    for (const step of ['fetch: sales', 'compute: card ', 'paint: card '])
      expect([step, titles().some(title => title.startsWith(`[xh-report-designer] render · ${step}`))]).toEqual([step, true])
    expect(titles().filter(title => !/ \d+\.\d ms$/.test(title) || title.includes(' pagination · '))).toEqual([])
    groups.mockClear()
    designer.settings = { [DESIGNER_SETTING_KEYS.debugRender]: true }
    await designer.updateComplete
    designer.requestUpdate()
    await designer.updateComplete
    expect(groups).not.toHaveBeenCalled()
  })
})

describe('<xh-report-designer>：自动保存', () => {
  const KEY = 'xh-designer-draft:xh-report-designer:board-1'
  const drafted: ReportDocument = { ...board, title: '草稿里的看板' }

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  async function until<T>(read: () => T | null | undefined): Promise<T> {
    for (let round = 0; round < 100; round++) {
      const value = read()
      if (value)
        return value
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error('等了 1 秒仍没到期望的状态')
  }

  /** 开着的确认框里写着 text 的钮；关上的确认框还留在页面上，不算。 */
  function button(text: string): HTMLButtonElement | undefined {
    return [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text && !item.closest('[data-state="closed"]'))
  }

  function rename(designer: XhReportDesigner, title: string): void {
    designer.execute([{ type: 'updateCard', id: 'a', changes: [{ path: ['title'], value: title }] }])
  }

  it('开着时改了停手约一秒存成草稿，键是设计器种类加 draftKey；markSaved 后草稿删掉；关着时不存', async () => {
    const designer = await mount({ settings: { [DESIGNER_SETTING_KEYS.autoSave]: true }, draftKey: 'board-1' })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    rename(designer, '改过')
    vi.advanceTimersByTime(999)
    expect(localStorage.getItem(KEY)).toBeNull()
    vi.advanceTimersByTime(1)
    expect((JSON.parse(localStorage.getItem(KEY)!) as { document: ReportDocument }).document).toEqual(designer.schema)
    designer.markSaved()
    expect(localStorage.getItem(KEY)).toBeNull()
    designer.settings = {}
    await designer.updateComplete
    rename(designer, '又改了')
    vi.advanceTimersByTime(1000)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('宿主装进同一个键、和草稿不一样的报表时问「发现未保存的草稿」：恢复后报表换成草稿、记一步撤销，撤销回到装进的那份', async () => {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), document: drafted }))
    const designer = await mount({ draftKey: 'board-1' })
    const restore = await until(() => button(DESIGNER_COMMANDS_EN_US.draftRestore))
    expect(document.body.textContent).toContain(DESIGNER_COMMANDS_EN_US.draftFoundDescription)
    restore.click()
    await until(() => designer.schema?.title === drafted.title)
    expect([designer.schema, designer.canUndo]).toEqual([drafted, true])
    expect(designer.undo()).toBe(true)
    expect(designer.schema).toEqual(board)
  })

  it('选丢弃：草稿删掉，报表照旧；草稿和装进的一样时不问、悄悄删掉；换一份 schema 装进来时也看草稿', async () => {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), document: drafted }))
    const designer = await mount({ draftKey: 'board-1' })
    ;(await until(() => button(DESIGNER_COMMANDS_EN_US.draftDiscard))).click()
    await until(() => localStorage.getItem(KEY) === null)
    expect(designer.schema).toEqual(board)
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), document: drafted }))
    designer.schema = structuredClone(drafted)
    await designer.updateComplete
    await until(() => localStorage.getItem(KEY) === null)
    expect(button(DESIGNER_COMMANDS_EN_US.draftRestore)).toBeUndefined()
  })
})
