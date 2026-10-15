/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView } from '../src'
import { placeGridItem, setGridItemRect } from '@xihan-ui/designer-kit'
import { describe, expect, it } from 'vitest'
import { applyOperations, gridItems, layoutOperations, validateDocument } from '../src'
import { dashboardDocument } from './documents'

describe('gridItems 与 layoutOperations', () => {
  const dashboard = dashboardDocument.body as DashboardView

  it('卡片取成网格项，次序与卡片相同', () => {
    const items = gridItems(dashboard)
    expect(items.map(item => item.id)).toEqual(dashboard.cards.map(card => card.id))
    expect(items[0]).toEqual({ id: dashboard.cards[0]!.id, ...dashboard.cards[0]!.layout })
  })

  it('只为位置变了的卡片产出 set，应用后文档仍然合法', () => {
    const before = gridItems(dashboard)
    const after = setGridItemRect(before, 'pivot', { x: 0, y: 0, w: 12 }, dashboard.grid.columns)
    const operations = layoutOperations(['body', 'cards'], before, after)
    expect(operations.every(operation => operation.type === 'set' && operation.path.at(-1) === 'layout')).toBe(true)
    expect(operations.map(operation => operation.path[2])).toContain('pivot')
    const { document } = applyOperations(dashboardDocument, operations)
    expect(validateDocument(document)).toEqual([])
    expect(gridItems(document.body as DashboardView)).toEqual(after)
    expect(layoutOperations(['body', 'cards'], before, before)).toEqual([])
  })

  it('新放入的卡片不产出操作', () => {
    const before = gridItems(dashboard)
    const after = placeGridItem(before, { id: 'extra', w: 3, h: 2 }, dashboard.grid.columns)
    expect(layoutOperations(['body', 'cards'], before, after)).toEqual([])
  })
})
