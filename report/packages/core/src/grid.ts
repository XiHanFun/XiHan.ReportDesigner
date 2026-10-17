/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 看板布局编辑：布局算法（碰撞、推开、对调、压实、找空位）用 @xihan-ui/designer-kit 的网格布局，这里把结果写成编辑操作。

import type { GridItem, GridOptions, GridRect } from '@xihan-ui/designer-kit'
import type { ReportOperation } from './operations'
import type { CardBase, CardLayout, ChartCard, DashboardCard, DashboardView, DataBinding, DataView, ExtensionCard, MetricCard, ReportExtensionKind, ReportQuery, TableCard } from './schema'
import { compactLayout, placeGridItem, removeGridItem, setGridItemRect } from '@xihan-ui/designer-kit'

/** 看板上全部卡片的网格位置，次序与卡片相同。 */
export function gridItems(dashboard: DashboardView): GridItem[] {
  return dashboard.cards.map(card => ({ id: card.id, ...card.layout }))
}

/**
 * 把布局的变化写成一条 layoutCards：before 里有、位置大小变了的卡片；没有变化时为空数组。
 * 新增与移除的卡片不在其中，由调用方另行新增或删除卡片。
 */
export function layoutOperations(before: readonly GridItem[], after: readonly GridItem[]): ReportOperation[] {
  const previous = new Map(before.map(item => [item.id, item]))
  const layouts: Record<string, CardLayout> = {}
  for (const item of after) {
    const old = previous.get(item.id)
    if (!old || (old.x === item.x && old.y === item.y && old.w === item.w && old.h === item.h))
      continue
    layouts[item.id] = { x: item.x, y: item.y, w: item.w, h: item.h }
  }
  return Object.keys(layouts).length === 0 ? [] : [{ type: 'layoutCards', layouts }]
}

/**
 * 拖动或改大小：把卡片放到 target（只改写了的项），压到的卡片向下推开，向下拖过下方卡片时两者对调，之后缺省整体压实。
 * from 是手势开始时的布局（缺省取看板当前布局）：拖动中每次都从它算起，产出的操作把看板当前布局改成结果。
 * 卡片不存在时抛 RangeError；没有变化时为空数组。
 */
export function planCardLayout(dashboard: DashboardView, id: string, target: Partial<GridRect>, options: GridOptions & { readonly from?: readonly GridItem[] } = {}): ReportOperation[] {
  const { from, ...grid } = options
  const after = setGridItemRect(from ?? gridItems(dashboard), id, target, dashboard.grid.columns, grid)
  return layoutOperations(gridItems(dashboard), after)
}

/** 压实布局：每张卡片向上移到碰到别的卡片为止，原本重叠的向下推开；没有变化时为空数组。 */
export function planCompactLayout(dashboard: DashboardView): ReportOperation[] {
  return layoutOperations(gridItems(dashboard), compactLayout(gridItems(dashboard), dashboard.grid.columns))
}

/** 新增卡片的位置：写了 x、y 时放在那里并推开压到的卡片，没写时放到第一个放得下的空位。 */
export interface CardPlacement {
  readonly w: number
  readonly h: number
  readonly x?: number
  readonly y?: number
}

/** 待新增的扩展卡片：同 ExtensionCard，layout 只需写大小。 */
export interface NewExtensionCard extends Omit<CardBase, 'layout'>, Partial<DataBinding> {
  readonly kind: ReportExtensionKind
  readonly layout: CardPlacement
  readonly query?: ReportQuery
  readonly view?: DataView
  readonly [key: string]: unknown
}

type WithPlacement<C extends Exclude<DashboardCard, ExtensionCard>> = Omit<C, 'layout'> & { readonly layout: CardPlacement }

/** 待新增的卡片：layout 只需写大小，位置可以留给 planAddCard 找空位。 */
export type NewCard = WithPlacement<ChartCard> | WithPlacement<MetricCard> | WithPlacement<TableCard> | NewExtensionCard

/**
 * 新增卡片：按 placement 放进网格（推开压到的卡片，缺省整体压实），产出 addCard 与其余卡片的 layoutCards。
 * 卡片 id 已存在时抛 RangeError。
 */
export function planAddCard(dashboard: DashboardView, card: NewCard, options: GridOptions & { readonly index?: number } = {}): ReportOperation[] {
  const { index, ...grid } = options
  const { layout, ...rest } = card
  const before = gridItems(dashboard)
  const after = placeGridItem(before, { id: card.id, ...layout }, dashboard.grid.columns, grid)
  const placed = after.find(item => item.id === card.id)!
  const added = { ...rest, layout: { x: placed.x, y: placed.y, w: placed.w, h: placed.h } } as DashboardCard
  return [
    index === undefined ? { type: 'addCard', card: added } : { type: 'addCard', card: added, index },
    ...layoutOperations(before, after),
  ]
}

/**
 * 删除卡片并清理联动：以它为源的联动整条删除，指向它的目标从联动里去掉，目标删空的联动也删除；
 * 之后缺省整体压实。卡片不存在时抛 RangeError。
 */
export function planRemoveCard(dashboard: DashboardView, id: string, options: GridOptions = {}): ReportOperation[] {
  const before = gridItems(dashboard)
  const after = removeGridItem(before, id, dashboard.grid.columns, options)
  const operations: ReportOperation[] = []
  for (const link of dashboard.links ?? []) {
    const targets = link.targets.filter(target => target.card !== id)
    if (link.card === id || targets.length === 0)
      operations.push({ type: 'removeLink', id: link.id })
    else if (targets.length !== link.targets.length)
      operations.push({ type: 'updateLink', id: link.id, changes: [{ path: ['targets'], value: targets.map(target => ({ ...target })) }] })
  }
  operations.push({ type: 'removeCard', id }, ...layoutOperations(before.filter(item => item.id !== id), after))
  return operations
}
