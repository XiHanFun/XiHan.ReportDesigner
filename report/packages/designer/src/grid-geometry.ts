/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 看板网格在画布上的几何：量出网格的原点与格距，把画布像素的矩形换成格坐标。

import type { GridRect, Rect, Size } from '@xihan-ui/designer-kit'

/** 网格在画布里的位置与格距，单位是画布像素。 */
export interface GridMetrics {
  /** 第一格左上角相对画布原点的位置。 */
  readonly x: number
  readonly y: number
  /** 列距：一列宽加一道列间隙。 */
  readonly column: number
  /** 行距：行高加一道行间隙。 */
  readonly row: number
  readonly columnGap: number
  readonly rowGap: number
}

/**
 * 量出网格：grid 是排卡片的网格元素，origin 是画布原点所在的元素，columns 与 rowHeight 取自看板定义。
 * 网格还没有宽度（未布局、不可见）时为 undefined。
 */
export function measureGrid(grid: Element, origin: Element, columns: number, rowHeight: number): GridMetrics | undefined {
  const style = getComputedStyle(grid)
  const px = (value: string): number => Number.parseFloat(value) || 0
  const box = grid.getBoundingClientRect()
  const base = origin.getBoundingClientRect()
  const left = px(style.borderLeftWidth) + px(style.paddingLeft)
  const right = px(style.borderRightWidth) + px(style.paddingRight)
  const top = px(style.borderTopWidth) + px(style.paddingTop)
  const columnGap = px(style.columnGap)
  const rowGap = px(style.rowGap)
  const width = box.width - left - right
  if (!(width > 0) || !(columns > 0) || !(rowHeight > 0))
    return undefined
  return {
    x: box.left - base.left + left,
    y: box.top - base.top + top,
    column: (width + columnGap) / columns,
    row: rowHeight + rowGap,
    columnGap,
    rowGap,
  }
}

/** 画布像素的矩形四舍五入成格坐标；宽高至少一格，位置不夹到网格内。 */
export function rectToCell(rect: Rect, metrics: GridMetrics): GridRect {
  return {
    x: Math.round((rect.x - metrics.x) / metrics.column),
    y: Math.round((rect.y - metrics.y) / metrics.row),
    w: Math.max(1, Math.round((rect.width + metrics.columnGap) / metrics.column)),
    h: Math.max(1, Math.round((rect.height + metrics.rowGap) / metrics.row)),
  }
}

/** 改大小时越出网格左、上、右边的部分剪掉，宽高至少一格。 */
export function clipCell(cell: GridRect, columns: number): GridRect {
  const x = Math.min(Math.max(0, cell.x), columns - 1)
  const y = Math.max(0, cell.y)
  const right = Math.min(cell.x + cell.w, columns)
  const bottom = cell.y + cell.h
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) }
}

/** 一格大小的卡片在画布上的尺寸。 */
export function cellSize(metrics: GridMetrics): Size {
  return { width: metrics.column - metrics.columnGap, height: metrics.row - metrics.rowGap }
}
