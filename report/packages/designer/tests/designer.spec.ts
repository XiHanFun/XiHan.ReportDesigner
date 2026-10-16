// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView, DatasetRequest, ReportDocument } from '@xihan-report/core'
import type { XhReportDesigner } from '../src'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
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

beforeAll(() => {
  defineReportDesigner()
  Element.prototype.scrollIntoView ??= function () {}
})

afterEach(() => {
  document.body.replaceChildren()
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
