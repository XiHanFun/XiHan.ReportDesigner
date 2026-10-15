/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView, GridItem } from '../src'
import { describe, expect, it } from 'vitest'
import {
  applyOperations,
  clampToGrid,
  compactLayout,
  gridCollides,
  gridItems,
  layoutOperations,
  placeGridItem,
  removeGridItem,
  ReportComputeError,
  setGridItemRect,
  validateDocument,
} from '../src'
import { dashboardDocument } from './documents'

function item(id: string, x: number, y: number, w: number, h: number): GridItem {
  return { id, x, y, w, h }
}

function boxes(items: readonly GridItem[]): Record<string, [number, number, number, number]> {
  return Object.fromEntries(items.map(entry => [entry.id, [entry.x, entry.y, entry.w, entry.h]]))
}

function code(run: () => unknown): string | undefined {
  try {
    run()
  }
  catch (error) {
    return error instanceof ReportComputeError ? error.code : 'other'
  }
  return undefined
}

function noOverlap(items: readonly GridItem[]): boolean {
  return items.every((a, i) => items.every((b, j) => i === j || !gridCollides(a, b)))
}

describe('clampToGrid', () => {
  it('取整并夹到网格内', () => {
    expect(clampToGrid(item('a', 10, -1, 6, 0), 12)).toEqual(item('a', 6, 0, 6, 1))
    expect(clampToGrid(item('a', 1.4, 2.6, 3.5, 1.2), 12)).toEqual(item('a', 1, 3, 4, 1))
    expect(clampToGrid(item('a', 0, 0, 20, 2), 12)).toEqual(item('a', 0, 0, 12, 2))
  })

  it('不是有限数时抛出 invalid-layout', () => {
    expect(code(() => clampToGrid(item('a', Number.NaN, 0, 1, 1), 12))).toBe('invalid-layout')
    expect(code(() => clampToGrid(item('a', 0, 0, Number.POSITIVE_INFINITY, 1), 12))).toBe('invalid-layout')
  })
})

describe('compactLayout', () => {
  it('自上而下把卡片向上移到碰到别的卡片为止，次序不变', () => {
    const result = compactLayout([item('a', 0, 2, 4, 2), item('b', 4, 5, 4, 2), item('c', 0, 6, 4, 2), item('d', 8, 0, 4, 1)], 12)
    expect(result.map(entry => entry.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(boxes(result)).toEqual({ a: [0, 0, 4, 2], b: [4, 0, 4, 2], c: [0, 2, 4, 2], d: [8, 0, 4, 1] })
  })

  it('原本重叠的卡片向下推开', () => {
    expect(boxes(compactLayout([item('a', 0, 0, 4, 2), item('b', 2, 1, 4, 2)], 12))).toEqual({ a: [0, 0, 4, 2], b: [2, 2, 4, 2] })
  })

  it('结果确定且不重叠', () => {
    const items = [item('a', 3, 4, 5, 3), item('b', 0, 0, 12, 1), item('c', 2, 1, 3, 9), item('d', 7, 2, 5, 2), item('e', 0, 9, 2, 2)]
    const first = compactLayout(items, 12)
    expect(compactLayout(items, 12)).toEqual(first)
    expect(noOverlap(first)).toBe(true)
    expect(compactLayout(first, 12)).toEqual(first)
  })
})

describe('setGridItemRect', () => {
  const base = [item('a', 0, 0, 6, 2), item('b', 6, 0, 6, 2), item('c', 0, 2, 6, 2)]

  it('拖到别的卡片上：被压的卡片向下推开并连锁推开', () => {
    expect(boxes(setGridItemRect(base, 'b', { x: 0, y: 0 }, 12))).toEqual({ a: [0, 2, 6, 2], b: [0, 0, 6, 2], c: [0, 4, 6, 2] })
  })

  it('向下拖过下方卡片的顶边时两者对调；拖不到顶边时压实回原位', () => {
    const stack = [item('a', 0, 0, 6, 2), item('b', 0, 2, 6, 2)]
    expect(boxes(setGridItemRect(stack, 'a', { y: 2 }, 12))).toEqual({ a: [0, 2, 6, 2], b: [0, 0, 6, 2] })
    expect(boxes(setGridItemRect(stack, 'a', { y: 1 }, 12))).toEqual({ a: [0, 0, 6, 2], b: [0, 2, 6, 2] })
  })

  it('向上拖到上方卡片上时被压的卡片让到下面', () => {
    const stack = [item('a', 0, 0, 6, 2), item('b', 0, 2, 6, 2)]
    expect(boxes(setGridItemRect(stack, 'b', { y: 0 }, 12))).toEqual({ a: [0, 2, 6, 2], b: [0, 0, 6, 2] })
  })

  it('改大小压到旁边的卡片时把它推下去', () => {
    expect(boxes(setGridItemRect(base, 'a', { w: 8 }, 12))).toEqual({ a: [0, 0, 8, 2], b: [6, 2, 6, 2], c: [0, 2, 6, 2] })
  })

  it('compact: false 时不压实', () => {
    expect(boxes(setGridItemRect(base, 'c', { y: 10 }, 12, { compact: false }))).toEqual({ a: [0, 0, 6, 2], b: [6, 0, 6, 2], c: [0, 10, 6, 2] })
    expect(boxes(setGridItemRect(base, 'c', { y: 10 }, 12))).toEqual({ a: [0, 0, 6, 2], b: [6, 0, 6, 2], c: [0, 2, 6, 2] })
  })

  it('目标越界时夹回网格内，id 不存在时抛出', () => {
    expect(boxes(setGridItemRect(base, 'a', { x: 9 }, 12)).a).toEqual([6, 0, 6, 2])
    expect(code(() => setGridItemRect(base, 'nope', { x: 0 }, 12))).toBe('unknown-card')
  })
})

describe('placeGridItem / removeGridItem', () => {
  const base = [item('a', 0, 0, 6, 2), item('b', 6, 0, 6, 2)]

  it('没写位置时放到第一个放得下的空位', () => {
    expect(placeGridItem(base, { id: 'n', w: 4, h: 2 }, 12).at(-1)).toEqual(item('n', 0, 2, 4, 2))
    expect(placeGridItem([item('a', 0, 0, 6, 2)], { id: 'n', w: 4, h: 1 }, 12).at(-1)).toEqual(item('n', 6, 0, 4, 1))
  })

  it('写了位置时推开碰撞的卡片', () => {
    expect(boxes(placeGridItem(base, { id: 'n', x: 0, y: 0, w: 12, h: 1 }, 12))).toEqual({ a: [0, 1, 6, 2], b: [6, 1, 6, 2], n: [0, 0, 12, 1] })
  })

  it('id 重复时抛出 duplicate-card', () => {
    expect(code(() => placeGridItem(base, { id: 'a', w: 1, h: 1 }, 12))).toBe('duplicate-card')
  })

  it('移除后压实', () => {
    const items = [item('a', 0, 0, 6, 2), item('b', 0, 2, 6, 2)]
    expect(removeGridItem(items, 'a', 12)).toEqual([item('b', 0, 0, 6, 2)])
    expect(removeGridItem(items, 'a', 12, { compact: false })).toEqual([item('b', 0, 2, 6, 2)])
  })
})

describe('layoutOperations', () => {
  it('只为位置变了的卡片产出 set，应用后文档仍然合法', () => {
    const dashboard = dashboardDocument.body as DashboardView
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
})
