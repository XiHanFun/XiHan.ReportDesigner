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
