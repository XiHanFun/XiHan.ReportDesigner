/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView } from '../src'
import { placeGridItem, setGridItemRect } from '@xihan-ui/designer-kit'
import { describe, expect, it } from 'vitest'
import { applyOperations, gridItems, layoutOperations, planAddCard, planCardLayout, planCompactLayout, planRemoveCard, validateDocument } from '../src'
import { dashboardDocument } from './documents'

describe('gridItems 与 layoutOperations', () => {
  const dashboard = dashboardDocument.body as DashboardView

  it('卡片取成网格项，次序与卡片相同', () => {
    const items = gridItems(dashboard)
    expect(items.map(item => item.id)).toEqual(dashboard.cards.map(card => card.id))
    expect(items[0]).toEqual({ id: dashboard.cards[0]!.id, ...dashboard.cards[0]!.layout })
  })

  it('位置变了的卡片写成一条 layoutCards，应用后文档仍然合法', () => {
    const before = gridItems(dashboard)
    const after = setGridItemRect(before, 'pivot', { x: 0, y: 0, w: 12 }, dashboard.grid.columns)
    const operations = layoutOperations(before, after)
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({ type: 'layoutCards', layouts: { pivot: expect.any(Object) } })
    const { document } = applyOperations(dashboardDocument, operations)
    expect(validateDocument(document)).toEqual([])
    expect(gridItems(document.body as DashboardView)).toEqual(after)
    expect(layoutOperations(before, before)).toEqual([])
  })

  it('新放入的卡片不产出操作', () => {
    const before = gridItems(dashboard)
    const after = placeGridItem(before, { id: 'extra', w: 3, h: 2 }, dashboard.grid.columns)
    expect(layoutOperations(before, after)).toEqual([])
  })
})

describe('看板布局编辑的计划函数', () => {
  const dashboard = dashboardDocument.body as DashboardView
  const layoutOf = (document: typeof dashboardDocument, id: string): unknown => (document.body as DashboardView).cards.find(card => card.id === id)?.layout

  it('planCardLayout：拖动卡片，压到的卡片让开，产出的文档没有重叠', () => {
    const operations = planCardLayout(dashboard, 'detail', { x: 0, y: 0 })
    const { document } = applyOperations(dashboardDocument, operations)
    expect(layoutOf(document, 'detail')).toMatchObject({ x: 0, y: 0 })
    expect(validateDocument(document)).toEqual([])
    expect(planCardLayout(dashboard, 'trend', { x: dashboard.cards[0]!.layout.x, y: dashboard.cards[0]!.layout.y })).toEqual([])
    expect(() => planCardLayout(dashboard, 'ghost', { x: 0 })).toThrow(RangeError)
  })

  it('planCardLayout 的 from：拖动中每次都从手势开始时的布局算起', () => {
    const start = gridItems(dashboard)
    const first = applyOperations(dashboardDocument, planCardLayout(dashboard, 'detail', { x: 0, y: 0 }, { from: start })).document
    const back = planCardLayout(first.body as DashboardView, 'detail', { x: 0, y: 9 }, { from: start })
    expect(gridItems(applyOperations(first, back).document.body as DashboardView)).toEqual(setGridItemRect(start, 'detail', { x: 0, y: 9 }, dashboard.grid.columns))
  })

  it('planAddCard：没写位置时放到第一个空位，写了位置时推开压到的卡片', () => {
    const card = { id: 'extra', kind: 'metric', layout: { w: 3, h: 2 }, dataset: 'sales', query: { dimensions: [], measures: [{ id: 'n', aggregate: 'count' }] }, metric: { value: 'n' } } as const
    const free = applyOperations(dashboardDocument, planAddCard(dashboard, card)).document
    expect(validateDocument(free)).toEqual([])
    expect(layoutOf(free, 'extra')).toMatchObject({ w: 3, h: 2 })
    const pushed = planAddCard(dashboard, { ...card, layout: { x: 0, y: 0, w: 12, h: 2 } }, { index: 0 })
    expect(pushed[0]).toMatchObject({ type: 'addCard', index: 0, card: { layout: { x: 0, y: 0, w: 12, h: 2 } } })
    expect(pushed[1]).toMatchObject({ type: 'layoutCards' })
    expect(validateDocument(applyOperations(dashboardDocument, pushed).document)).toEqual([])
    expect(() => planAddCard(dashboard, { ...card, id: 'kpi' })).toThrow(RangeError)
  })

  it('planRemoveCard：删掉以它为源的联动，从别的联动里去掉指向它的目标，目标删空的联动也删除', () => {
    const operations = planRemoveCard(dashboard, 'pivot')
    expect(operations).toContainEqual({ type: 'removeLink', id: 'byRegion' })
    expect(operations).toContainEqual({ type: 'updateLink', id: 'byMonth', changes: [{ path: ['targets'], value: [{ card: 'detail', field: 'date' }] }] })
    const { document, inverse } = applyOperations(dashboardDocument, operations)
    expect(validateDocument(document)).toEqual([])
    expect(applyOperations(document, inverse).document).toEqual(dashboardDocument)
    const share = applyOperations(dashboardDocument, planRemoveCard(dashboard, 'share')).document
    expect((share.body as DashboardView).links!.map(link => link.id)).toEqual(['byMonth'])
    expect(validateDocument(share)).toEqual([])
  })

  it('planCompactLayout：压实后卡片向上靠拢', () => {
    const loose = applyOperations(dashboardDocument, [{ type: 'layoutCards', layouts: { detail: { x: 0, y: 30, w: 6, h: 4 } } }]).document
    const operations = planCompactLayout(loose.body as DashboardView)
    expect(operations).toHaveLength(1)
    expect(layoutOf(applyOperations(loose, operations).document, 'detail')).toMatchObject({ y: 9 })
    expect(planCompactLayout(dashboard)).toEqual([])
  })
})
