/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 看板网格的布局算法：夹到网格内、压实、拖动与改大小时推开碰撞的卡片。

import type { ReportPath } from './issue'
import type { ReportOperation } from './operations'
import type { CardLayout, DashboardView } from './schema'
import { ReportComputeError } from './engine/errors'

/** 网格上的一张卡片：id 与位置大小，单位是格。 */
export interface GridItem extends CardLayout {
  readonly id: string
}

/** 布局选项。 */
export interface GridOptions {
  /** 调整之后整体向上压实，缺省 true。 */
  readonly compact?: boolean
}

/** 新卡片：不写 x、y 时放到第一个放得下的空位。 */
export interface GridPlacement {
  readonly id: string
  readonly w: number
  readonly h: number
  readonly x?: number
  readonly y?: number
}

function integer(value: number, name: string): number {
  if (!Number.isFinite(value))
    throw new ReportComputeError('invalid-layout', { property: name, value })
  return Math.round(value)
}

/**
 * 把位置大小夹到网格内：取整，宽在 1 到列数之间，高至少 1，x 不让卡片越过右边界，x、y 不小于 0。
 * 不是有限数的值抛出 invalid-layout。
 */
export function clampToGrid<T extends CardLayout>(item: T, columns: number): T {
  const total = Math.max(1, integer(columns, 'columns'))
  const w = Math.min(Math.max(integer(item.w, 'w'), 1), total)
  const h = Math.max(integer(item.h, 'h'), 1)
  const x = Math.min(Math.max(integer(item.x, 'x'), 0), total - w)
  const y = Math.max(integer(item.y, 'y'), 0)
  return { ...item, x, y, w, h }
}

/** 两张卡片是否重叠。 */
export function gridCollides(a: CardLayout, b: CardLayout): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function lowestFree<T extends CardLayout>(item: T, placed: readonly CardLayout[]): T {
  let y = item.y
  let colliders = placed.filter(other => gridCollides({ ...item, y }, other))
  while (colliders.length > 0) {
    y = Math.max(...colliders.map(other => other.y + other.h))
    colliders = placed.filter(other => gridCollides({ ...item, y }, other))
  }
  return y === item.y ? item : { ...item, y }
}

function rise<T extends CardLayout>(item: T, placed: readonly CardLayout[]): T {
  let y = item.y
  while (y > 0 && !placed.some(other => gridCollides({ ...item, y: y - 1 }, other)))
    y--
  return y === item.y ? item : { ...item, y }
}

/** 按 y、x、原有次序排出处理次序；first 给出的下标在同位置时优先。 */
function order(items: readonly CardLayout[], first = -1): number[] {
  return items
    .map((_, index) => index)
    .sort((a, b) => {
      const ia = items[a]!
      const ib = items[b]!
      return ia.y - ib.y || ia.x - ib.x || (a === first ? -1 : b === first ? 1 : a - b)
    })
}

function compactClamped<T extends CardLayout>(items: readonly T[], first = -1): T[] {
  const result = items.slice()
  const placed: T[] = []
  for (const index of order(items, first)) {
    const item = lowestFree(rise(items[index]!, placed), placed)
    placed.push(item)
    result[index] = item
  }
  return result
}

/**
 * 压实布局：先夹到网格内，再按自上而下、自左而右的次序，把每张卡片向上移到碰到别的卡片为止；
 * 原本重叠的卡片向下推开。返回新数组，次序与输入相同。
 */
export function compactLayout<T extends CardLayout>(items: readonly T[], columns: number): T[] {
  return compactClamped(items.map(item => clampToGrid(item, columns)))
}

function indexOf(items: readonly GridItem[], id: string): number {
  const index = items.findIndex(item => item.id === id)
  if (index < 0)
    throw new ReportComputeError('unknown-card', { card: id })
  return index
}

/** 固定 anchor 处的卡片，其余卡片按自上而下的次序避开已放好的卡片、向下推开。 */
function settle(items: readonly GridItem[], anchor: number, options: GridOptions): GridItem[] {
  const result = items.slice()
  const placed: GridItem[] = [items[anchor]!]
  for (const index of order(items)) {
    if (index === anchor)
      continue
    const item = lowestFree(items[index]!, placed)
    placed.push(item)
    result[index] = item
  }
  return options.compact === false ? result : compactClamped(result, anchor)
}

/**
 * 拖动或改大小：把 id 的卡片放到 target（只改写了的项），压到它的卡片向下推开，被推的卡片再推开它压到的；
 * 向下拖时，顶边不低于它新顶边的被压卡片先挪到它的上方，压实后两者对调。
 * 之后缺省整体压实，同位置时被拖的卡片优先。id 不存在时抛出 unknown-card。
 */
export function moveGridItem(items: readonly GridItem[], id: string, target: Partial<CardLayout>, columns: number, options: GridOptions = {}): GridItem[] {
  const index = indexOf(items, id)
  const origin = clampToGrid(items[index]!, columns)
  const moved = clampToGrid({ ...items[index]!, ...target }, columns)
  const clamped = items.map((item, i) => {
    if (i === index)
      return moved
    const other = clampToGrid(item, columns)
    if (moved.y > origin.y && other.y <= moved.y && gridCollides(other, moved))
      return { ...other, y: Math.max(0, moved.y - other.h) }
    return other
  })
  return settle(clamped, index, options)
}

/**
 * 放入新卡片：写了 x、y 时放在那里并推开碰撞的卡片，没写时放到第一个放得下的空位（自上而下、自左而右）。
 * 新卡片排在数组末尾；id 已存在时抛出 duplicate-card。
 */
export function placeGridItem(items: readonly GridItem[], placement: GridPlacement, columns: number, options: GridOptions = {}): GridItem[] {
  if (items.some(item => item.id === placement.id))
    throw new ReportComputeError('duplicate-card', { card: placement.id })
  const clamped = items.map(item => clampToGrid(item, columns))
  if (placement.x !== undefined && placement.y !== undefined) {
    const item = clampToGrid({ id: placement.id, x: placement.x, y: placement.y, w: placement.w, h: placement.h }, columns)
    return settle([...clamped, item], clamped.length, options)
  }
  const size = clampToGrid({ id: placement.id, x: 0, y: 0, w: placement.w, h: placement.h }, columns)
  const total = Math.max(1, Math.round(columns))
  for (let y = 0; ; y++) {
    for (let x = 0; x + size.w <= total; x++) {
      const candidate = { ...size, x, y }
      if (!clamped.some(other => gridCollides(candidate, other)))
        return [...clamped, candidate]
    }
  }
}

/** 移除卡片，缺省之后整体压实；id 不存在时抛出 unknown-card。 */
export function removeGridItem(items: readonly GridItem[], id: string, columns: number, options: GridOptions = {}): GridItem[] {
  const index = indexOf(items, id)
  const rest = items.filter((_, i) => i !== index)
  return options.compact === false ? rest : compactLayout(rest, columns)
}

/** 看板上全部卡片的网格位置，次序与卡片相同。 */
export function gridItems(dashboard: DashboardView): GridItem[] {
  return dashboard.cards.map(card => ({ id: card.id, ...card.layout }))
}

/**
 * 把布局的变化写成编辑操作：before 里有、位置大小变了的卡片各产出一条 set，路径为 [...cardsPath, id, 'layout']。
 * 新增与移除的卡片不产出操作，由调用方另行插入或删除卡片。
 */
export function layoutOperations(cardsPath: ReportPath, before: readonly GridItem[], after: readonly GridItem[]): ReportOperation[] {
  const previous = new Map(before.map(item => [item.id, item]))
  const operations: ReportOperation[] = []
  for (const item of after) {
    const old = previous.get(item.id)
    if (!old || (old.x === item.x && old.y === item.y && old.w === item.w && old.h === item.h))
      continue
    operations.push({ type: 'set', path: [...cardsPath, item.id, 'layout'], value: { x: item.x, y: item.y, w: item.w, h: item.h } })
  }
  return operations
}
