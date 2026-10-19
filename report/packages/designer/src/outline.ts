/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 页面结构：报表的大纲。看板按阅读顺序（先行后列）列出卡片，卡片下面是它的列表（维度、度量、系列、列、分组、行），
// 列表下面是项；主体不是看板时顶层是那一个视图。卡片的位置由网格坐标定，不能在树里挪；列表项能在同一列表里换序，
// 交叉表的行与列之间能互换。数据集与参数在数据面板里，联动在字段栏里，大纲不列。

import type { DashboardCard, ItemList, MoveItemOperation, ReportDocument } from '@xihan-report/core'
import type { ReportDesignerTranslations } from '@xihan-report/runtime'
import type { DesignerOutlineAdapter, DesignerOutlineMove, DesignerOutlineNode } from '@xihan-ui/designer-shell'
import type { ReportItemRef } from './editor'
import type { ReportDesignerContext } from './extensions'
import type { WellsOwner } from './wells'
import { cardTypeOf, isDataView } from '@xihan-report/core'
import { REPORT_CARD_TYPE_ICONS } from './card-icons'
import { bodyOwner, cardOwner, ownerLists } from './wells'

/** 大纲里一行指的是什么。 */
type OutlineRef
  = | { readonly kind: 'body' }
    | { readonly kind: 'card', readonly card: string }
    | { readonly kind: 'list', readonly card: string | undefined, readonly list: ItemList }
    | { readonly kind: 'item', readonly card: string | undefined, readonly list: ItemList, readonly id: string }

const BODY_ID = JSON.stringify(['body'])

function cardId(card: string): string {
  return JSON.stringify(['card', card])
}

function listId(card: string | undefined, list: ItemList): string {
  return JSON.stringify(['list', card ?? null, list])
}

function itemId(card: string | undefined, list: ItemList, id: string): string {
  return JSON.stringify(['item', card ?? null, list, id])
}

/** 行 id 读回它指的东西；认不得时为 undefined。 */
function parseId(id: string | null): OutlineRef | undefined {
  if (id === null)
    return undefined
  let value: unknown
  try {
    value = JSON.parse(id)
  }
  catch {
    return undefined
  }
  if (!Array.isArray(value))
    return undefined
  const [kind, a, b, c] = value as [unknown, unknown, unknown, unknown]
  const card = typeof a === 'string' ? a : undefined
  if (kind === 'body')
    return { kind }
  if (kind === 'card' && card !== undefined)
    return { kind, card }
  if (kind === 'list' && typeof b === 'string')
    return { kind, card, list: b as ItemList }
  if (kind === 'item' && typeof b === 'string' && typeof c === 'string')
    return { kind, card, list: b as ItemList, id: c }
  return undefined
}

/** 一个编辑对象的列表行与项行。 */
function listNodes(document: ReportDocument, owner: WellsOwner | undefined, t: ReportDesignerTranslations): DesignerOutlineNode[] {
  if (!owner)
    return []
  return ownerLists(document, owner, t).map(list => ({
    id: listId(owner.card, list.list),
    label: list.label,
    selectable: false,
    movable: false,
    deletable: false,
    children: list.items.map(item => ({ id: itemId(owner.card, list.list, item.id), label: item.label })),
  }))
}

/** 卡片那一行：有标题写标题、副文本写种类名；没有标题写「种类名 · id」。 */
function cardNode(document: ReportDocument, card: DashboardCard, t: ReportDesignerTranslations): DesignerOutlineNode {
  const type = cardTypeOf(card)
  const kind = t.cardTypes[type] ?? type
  const icon = (REPORT_CARD_TYPE_ICONS as Readonly<Record<string, DesignerOutlineNode['icon']>>)[type]
  return {
    id: cardId(card.id),
    ...(card.title ? { label: card.title, description: kind } : { label: `${kind} · ${card.id}` }),
    ...(icon ? { icon } : {}),
    movable: false,
    children: listNodes(document, cardOwner(card), t),
  }
}

/** 整棵树。 */
function outlineNodes(document: ReportDocument, t: ReportDesignerTranslations): DesignerOutlineNode[] {
  const body = document.body
  if (body.type === 'dashboard') {
    const cards = [...body.cards].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
    return cards.map(card => cardNode(document, card, t))
  }
  const type = isDataView(body) ? `table.${body.type}` : body.type
  const icon = (REPORT_CARD_TYPE_ICONS as Readonly<Record<string, DesignerOutlineNode['icon']>>)[type]
  return [{
    id: BODY_ID,
    label: t.cardTypes[type] ?? type,
    ...(icon ? { icon } : {}),
    movable: false,
    deletable: false,
    children: listNodes(document, bodyOwner(document), t),
  }]
}

/** 编辑对象：卡片 id 为 undefined 时是报表主体。 */
function ownerOf(document: ReportDocument, card: string | undefined): WellsOwner | undefined {
  if (card === undefined)
    return bodyOwner(document)
  const found = document.body.type === 'dashboard' ? document.body.cards.find(item => item.id === card) : undefined
  return found && cardOwner(found)
}

/** 挪动的起点与落点：起点是一项，落点是同一个编辑对象的列表。 */
function moveEnds(move: DesignerOutlineMove): { readonly from: Extract<OutlineRef, { kind: 'item' }>, readonly to: Extract<OutlineRef, { kind: 'list' }> } | undefined {
  const from = parseId(move.id)
  const to = parseId(move.parent)
  return from?.kind === 'item' && to?.kind === 'list' && from.card === to.card ? { from, to } : undefined
}

/** 页面结构的适配器：树、选择、标出、删除与列表项的挪动都翻成设计器的公开方法。 */
export const REPORT_OUTLINE_ADAPTER: DesignerOutlineAdapter<ReportDesignerContext> = {
  nodes: ({ designer, translations }) => designer.schema ? outlineNodes(designer.schema, translations) : [],
  selection: ({ designer }) => {
    const selection = designer.getSelection()
    if (selection.item)
      return [itemId(selection.item.card, selection.item.list, selection.item.id)]
    return selection.data ? [] : selection.cards.map(cardId)
  },
  select: ({ designer }, ids) => {
    const refs = ids.map(parseId).filter(ref => ref !== undefined)
    const first = refs[0]
    if (first?.kind === 'item') {
      designer.revealItem({ ...(first.card === undefined ? {} : { card: first.card }), list: first.list, id: first.id } satisfies ReportItemRef)
      return
    }
    if (first?.kind === 'body') {
      designer.select({ cards: [] })
      return
    }
    const cards = refs.flatMap(ref => ref.kind === 'card' ? [ref.card] : [])
    designer.select({ cards })
    if (cards[0] !== undefined)
      designer.revealCard(cards[0])
  },
  highlight: ({ designer }, id) => {
    const ref = parseId(id)
    designer.highlightCard(ref && ref.kind !== 'body' ? ref.card ?? null : null)
  },
  remove: ({ designer }, ids) => {
    const refs = ids.map(parseId).filter(ref => ref !== undefined)
    const item = refs.find(ref => ref.kind === 'item')
    if (item) {
      designer.select({ cards: item.card === undefined ? [] : [item.card], item: { ...(item.card === undefined ? {} : { card: item.card }), list: item.list, id: item.id } })
    }
    else {
      const cards = refs.flatMap(ref => ref.kind === 'card' ? [ref.card] : [])
      if (cards.length === 0)
        return
      designer.select({ cards })
    }
    designer.deleteSelection()
  },
  canMove: ({ designer }, move) => {
    const ends = moveEnds(move)
    const document = designer.schema
    if (!ends || !document)
      return false
    if (ends.from.list === ends.to.list)
      return true
    const owner = ownerOf(document, ends.from.card)
    const pivot = new Set<ItemList>(['rows', 'columns'])
    return owner?.view?.type === 'crosstab' && pivot.has(ends.from.list) && pivot.has(ends.to.list)
  },
  move: ({ designer }, move) => {
    const ends = moveEnds(move)
    if (!ends)
      return
    const { from, to } = ends
    const operation: MoveItemOperation = {
      type: 'moveItem',
      ...(from.card === undefined ? {} : { card: from.card }),
      list: from.list,
      id: from.id,
      index: move.index,
      ...(to.list === from.list ? {} : { to: to.list }),
    }
    designer.execute([operation])
  },
}
