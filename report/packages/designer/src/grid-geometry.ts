/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 看板网格在画布上的几何：量出网格的原点与格距，画布像素的矩形、点与格坐标互换。

import type { GridRect, Point, Rect, Size } from '@xihan-ui/designer-kit'

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
 * 量出网格：grid 是排卡片的网格元素，origin 是画布原点所在的元素，columns 与 rowHeight 取自看板定义，zoom 是画布的缩放倍数：
 * 屏幕上量出的偏移与宽度除以它换回画布像素，计算样式里的边框、内边距与间隙本来就是画布像素。
 * 网格还没有宽度（未布局、不可见）时为 undefined。
 */
export function measureGrid(grid: Element, origin: Element, columns: number, rowHeight: number, zoom = 1): GridMetrics | undefined {
  const style = getComputedStyle(grid)
  const px = (value: string): number => Number.parseFloat(value) || 0
  const box = grid.getBoundingClientRect()
  const base = origin.getBoundingClientRect()
  const left = px(style.borderLeftWidth) + px(style.paddingLeft)
  const right = px(style.borderRightWidth) + px(style.paddingRight)
  const top = px(style.borderTopWidth) + px(style.paddingTop)
  const columnGap = px(style.columnGap)
  const rowGap = px(style.rowGap)
  const width = box.width / zoom - left - right
  if (!(width > 0) || !(columns > 0) || !(rowHeight > 0))
    return undefined
  return {
    x: (box.left - base.left) / zoom + left,
    y: (box.top - base.top) / zoom + top,
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

/** 以画布上的点为中心放 w × h 格的卡片时左上角所在的格，夹在网格内。 */
export function centeredCell(point: Point, size: { readonly w: number, readonly h: number }, metrics: GridMetrics, columns: number): { readonly x: number, readonly y: number } {
  const w = Math.min(size.w, columns)
  const x = Math.round((point.x - metrics.x) / metrics.column - w / 2)
  const y = Math.round((point.y - metrics.y) / metrics.row - size.h / 2)
  return { x: Math.min(Math.max(0, x), columns - w), y: Math.max(0, y) }
}

/** 格坐标换回画布像素的矩形。 */
export function cellToRect(cell: GridRect, metrics: GridMetrics): Rect {
  return {
    x: metrics.x + cell.x * metrics.column,
    y: metrics.y + cell.y * metrics.row,
    width: cell.w * metrics.column - metrics.columnGap,
    height: cell.h * metrics.row - metrics.rowGap,
  }
}

/** 一格大小的卡片在画布上的尺寸。 */
export function cellSize(metrics: GridMetrics): Size {
  return { width: metrics.column - metrics.columnGap, height: metrics.row - metrics.rowGap }
}
