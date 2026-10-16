// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { GridMetrics } from '../src/grid-geometry'
import { describe, expect, it } from 'vitest'
import { cellSize, clipCell, measureGrid, rectToCell } from '../src/grid-geometry'

function box(element: Element, x: number, y: number, width: number, height: number): void {
  element.getBoundingClientRect = () => ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON: () => ({}) })
}

const metrics: GridMetrics = { x: 16, y: 16, column: 100, row: 52, columnGap: 12, rowGap: 12 }

describe('看板网格的几何', () => {
  it('量出网格的原点与格距：列距是列宽加间隙，行距是行高加间隙，扣掉网格的内边距', () => {
    const origin = document.createElement('div')
    const grid = document.createElement('div')
    grid.style.cssText = 'padding: 4px; column-gap: 12px; row-gap: 8px'
    box(origin, 100, 50, 1000, 800)
    box(grid, 116, 66, 1188 + 8, 400)
    expect(measureGrid(grid, origin, 12, 40)).toEqual({ x: 20, y: 20, column: 100, row: 48, columnGap: 12, rowGap: 8 })
  })

  it('网格还没有宽度时量不出来', () => {
    const element = document.createElement('div')
    box(element, 0, 0, 0, 0)
    expect(measureGrid(element, element, 12, 40)).toBeUndefined()
  })

  it('矩形四舍五入成格坐标，宽高至少一格', () => {
    expect(rectToCell({ x: 16 + 200, y: 16 + 104, width: 388, height: 92 }, metrics)).toEqual({ x: 2, y: 2, w: 4, h: 2 })
    expect(rectToCell({ x: 16 + 240, y: 16 + 20, width: 30, height: 10 }, metrics)).toEqual({ x: 2, y: 0, w: 1, h: 1 })
    expect(rectToCell({ x: -80, y: -60, width: 188, height: 40 }, metrics)).toEqual({ x: -1, y: -1, w: 2, h: 1 })
  })

  it('改大小时剪掉越出网格左、上、右边的部分', () => {
    expect(clipCell({ x: -1, y: -2, w: 4, h: 5 }, 12)).toEqual({ x: 0, y: 0, w: 3, h: 3 })
    expect(clipCell({ x: 10, y: 1, w: 4, h: 2 }, 12)).toEqual({ x: 10, y: 1, w: 2, h: 2 })
    expect(clipCell({ x: -3, y: 0, w: 2, h: 1 }, 12)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('一格大小的卡片尺寸', () => {
    expect(cellSize(metrics)).toEqual({ width: 88, height: 40 })
  })
})
