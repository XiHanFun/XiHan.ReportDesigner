/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView, ReportDocument } from '@xihan-report/core'
import type { ReportEditorChange } from '../src/editor'
import { validateDocument } from '@xihan-report/core'
import { describe, expect, it } from 'vitest'
import { createReportEditor, propertyMergeKey, readReportClipboard, writeReportClipboard } from '../src/editor'

function metric(id: string, x: number, y: number): DashboardView['cards'][number] {
  return {
    id,
    kind: 'metric',
    title: id,
    layout: { x, y, w: 4, h: 2 },
    dataset: 'sales',
    query: { dimensions: [], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] },
    metric: { value: 'amount' },
  }
}

const board: ReportDocument = {
  schemaVersion: 1,
  id: 'board',
  datasets: [{ id: 'sales', fields: [{ name: 'region', type: 'string', title: '区域' }, { name: 'amount', type: 'number' }] }],
  body: {
    type: 'dashboard',
    grid: { columns: 12, rowHeight: 40 },
    cards: [
      {
        id: 'pie',
        kind: 'chart',
        layout: { x: 0, y: 0, w: 4, h: 4 },
        dataset: 'sales',
        query: { dimensions: [{ id: 'region', field: 'region' }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] },
        chart: { type: 'pie', nameField: 'region', valueField: 'amount' },
      },
      metric('a', 4, 0),
      metric('b', 8, 0),
    ],
    links: [{ id: 'byRegion', card: 'pie', dimension: 'region', targets: [{ card: 'a', field: 'region' }, { card: 'b', field: 'region' }] }],
  },
}

function cards(document: ReportDocument): DashboardView['cards'] {
  return (document.body as DashboardView).cards
}

function layoutOf(document: ReportDocument, id: string): unknown {
  return cards(document).find(card => card.id === id)?.layout
}

describe('createReportEditor', () => {
  it('执行、撤销与重做，派发带种类与操作的文档变化', () => {
    const editor = createReportEditor({ document: board })
    const changes: ReportEditorChange[] = []
    editor.subscribe(change => changes.push(change))
    editor.execute([{ type: 'updateCard', id: 'a', changes: [{ path: ['title'], value: '销售额' }] }])
    expect(cards(editor.document)[1]!.title).toBe('销售额')
    expect(editor.undo()).toBe(true)
    expect(editor.document).toEqual(board)
    expect(editor.redo()).toBe(true)
    expect(changes.map(change => change.kind === 'document' ? change.cause : 'selection')).toEqual(['execute', 'undo', 'redo'])
    expect(editor.history.dirty).toBe(true)
  })

  it('连续输入带同一合并键时并成一步，封口后另起一步', () => {
    let now = 0
    const editor = createReportEditor({ document: board, now: () => now })
    const merge = propertyMergeKey('a', ['title'])
    expect(merge).toBe('prop:a:title')
    for (const title of ['销', '销售', '销售额']) {
      now += 100
      editor.execute([{ type: 'updateCard', id: 'a', changes: [{ path: ['title'], value: title }] }], { merge })
    }
    expect(editor.history.undoCount).toBe(1)
    editor.seal()
    editor.execute([{ type: 'updateCard', id: 'a', changes: [{ path: ['title'], value: '收入' }] }], { merge })
    expect(editor.history.undoCount).toBe(2)
  })

  it('新增卡片：按种类分配 id、放到空位并选中；撤销后选择随之去掉', () => {
    const editor = createReportEditor({ document: board })
    const card = editor.addCard({ kind: 'metric', layout: { w: 4, h: 2 }, dataset: 'sales', query: { dimensions: [], measures: [{ id: 'n', aggregate: 'count' }] }, metric: { value: 'n' } })
    expect(card.id).toBe('metric1')
    expect(card.layout).toEqual({ x: 4, y: 2, w: 4, h: 2 })
    expect(editor.selection).toEqual({ cards: ['metric1'] })
    expect(validateDocument(editor.document)).toEqual([])
    editor.undo()
    expect(editor.selection).toEqual({ cards: [] })
  })

  it('删除选中的卡片：连带清理联动并压实，记为一步撤销', () => {
    const editor = createReportEditor({ document: board })
    editor.select({ cards: ['pie', 'a'] })
    expect(editor.deleteSelection()).toBe(true)
    expect(cards(editor.document).map(card => card.id)).toEqual(['b'])
    expect((editor.document.body as DashboardView).links).toBeUndefined()
    expect(validateDocument(editor.document)).toEqual([])
    expect(editor.history.undoCount).toBe(1)
    editor.undo()
    expect(editor.document).toEqual(board)
    editor.clearSelection()
    expect(editor.deleteSelection()).toBe(false)
  })

  it('选中列表项时删除该项', () => {
    const editor = createReportEditor({ document: board })
    editor.select({ cards: ['pie'], item: { card: 'pie', list: 'measures', id: 'amount' } })
    editor.deleteSelection()
    expect(cards(editor.document)[0]).toMatchObject({ query: { measures: [] } })
    expect(editor.selection).toEqual({ cards: ['pie'] })
  })

  it('删除列表项走 planRemoveItem：别处对它的引用一并清理，记为一步撤销', () => {
    const editor = createReportEditor({ document: board })
    editor.select({ cards: ['pie'], item: { card: 'pie', list: 'dimensions', id: 'region' } })
    editor.deleteSelection()
    expect(cards(editor.document)[0]).toMatchObject({ query: { dimensions: [] } })
    expect((editor.document.body as DashboardView).links).toBeUndefined()
    expect(editor.history.undoCount).toBe(1)
    editor.undo()
    expect(editor.document).toEqual(board)
  })

  it('选择：替换、追加、切换与全选', () => {
    const editor = createReportEditor({ document: board })
    editor.select({ cards: ['a'] })
    editor.select({ cards: ['b'] }, 'add')
    editor.select({ cards: ['a'] }, 'toggle')
    expect(editor.selection.cards).toEqual(['b'])
    editor.selectAll()
    expect(editor.selection.cards).toEqual(['pie', 'a', 'b'])
  })

  it('拖动手势：事务里每次都从手势开始时的布局算起，结束时记为一步；取消时还原', () => {
    const editor = createReportEditor({ document: board })
    const gesture = editor.startLayout('移动')
    gesture.move('b', { x: 0, y: 0 })
    expect(layoutOf(editor.document, 'b')).toMatchObject({ x: 0, y: 0 })
    gesture.move('b', { x: 8, y: 0 })
    expect(editor.document).toEqual(board)
    gesture.move('b', { x: 0, y: 4 })
    gesture.end()
    gesture.move('b', { x: 4, y: 0 })
    expect(editor.history.undoCount).toBe(1)
    expect(editor.history.undoLabel).toBe('移动')
    expect(validateDocument(editor.document)).toEqual([])

    const cancelled = editor.startLayout()
    cancelled.move('a', { w: 12 })
    cancelled.cancel()
    expect(editor.history.undoCount).toBe(1)
    expect(layoutOf(editor.document, 'a')).toEqual({ x: 4, y: 0, w: 4, h: 2 })
  })

  it('复制与粘贴：撞上的 id 换新、联动随之改写，粘贴的卡片放到空位并被选中', () => {
    const editor = createReportEditor({ document: board })
    editor.select({ cards: ['pie', 'a'] })
    const copied = editor.copy()!
    expect(copied).toMatchObject({ cards: [{ id: 'pie' }, { id: 'a' }], links: [{ id: 'byRegion', targets: [{ card: 'a' }] }] })
    expect(readReportClipboard(writeReportClipboard(copied))).toEqual(copied)
    expect(editor.hasClipboard).toBe(true)
    const pasted = editor.paste()
    expect(pasted.cards).toEqual(['card1', 'card2'])
    expect(editor.selection).toEqual(pasted)
    const links = (editor.document.body as DashboardView).links!
    expect(links.at(-1)).toEqual({ id: 'link1', card: 'card1', dimension: 'region', targets: [{ card: 'card2', field: 'region' }] })
    expect(validateDocument(editor.document)).toEqual([])
    expect(editor.history.undoCount).toBe(1)
    editor.undo()
    expect(editor.document).toEqual(board)
  })

  it('粘贴到别的报表时 id 不冲突就保留；剪贴板文本不合格时读不出内容，没有内容时贴出空选择', () => {
    const source = createReportEditor({ document: board })
    source.select({ cards: ['a'] })
    const copied = source.copy()!
    const target = createReportEditor({ document: { ...board, body: { type: 'dashboard', grid: { columns: 12, rowHeight: 40 }, cards: [] } } })
    expect(target.hasClipboard).toBe(false)
    expect(target.paste()).toEqual({ cards: [] })
    expect(target.paste(copied)).toEqual({ cards: ['a'] })
    expect(readReportClipboard('not json')).toBeUndefined()
    expect(readReportClipboard(writeReportClipboard({ cards: [], links: [] }))).toBeUndefined()
    expect(readReportClipboard(JSON.stringify({ format: 'xihan-designer-clipboard', product: 'xihan-print', version: 1, payload: {} }))).toBeUndefined()
  })

  it('剪切与再制', () => {
    const editor = createReportEditor({ document: board })
    editor.select({ cards: ['b'] })
    expect(editor.duplicate()).toEqual({ cards: ['card1'] })
    editor.select({ cards: ['card1'] })
    expect(editor.cut()).toBeDefined()
    expect(cards(editor.document).map(card => card.id)).toEqual(['pie', 'a', 'b'])
  })

  it('数据集的可绑定字段树，装载新文档时清空历史与选择', () => {
    const editor = createReportEditor({ document: board })
    expect(editor.dataFields('sales')).toEqual([{ name: 'region', label: '区域', kind: 'value' }, { name: 'amount', kind: 'value' }])
    expect(editor.dataFields('ghost')).toEqual([])
    editor.select({ cards: ['a'] })
    editor.execute([{ type: 'removeCard', id: 'b' }])
    editor.load(board)
    expect(editor.history.canUndo).toBe(false)
    expect(editor.selection).toEqual({ cards: [] })
    expect(editor.validate()).toEqual([])
  })

  it('报表主体不是看板时，看板命令抛错', () => {
    const editor = createReportEditor({ document: { ...board, body: { type: 'table', dataset: 'sales', columns: [{ id: 'region', field: 'region' }] } } })
    expect(() => editor.startLayout()).toThrow(RangeError)
    expect(() => editor.addCard({ kind: 'metric', layout: { w: 1, h: 1 }, dataset: 'sales', query: { dimensions: [], measures: [] }, metric: { value: 'x' } })).toThrow(RangeError)
    expect(editor.copy()).toBeUndefined()
    expect(editor.duplicate()).toEqual({ cards: [] })
  })
})
