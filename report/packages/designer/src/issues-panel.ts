/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 问题列表：校验问题交给 <xh-designer-issues>，按所在对象分组；点问题时按问题的路径选中对应的卡片、列表项、
// 数据集字段或报表参数并滚到它。问题的文字与所在对象的名字由 reportIssueItems 给出，JSON 编辑框也用它。

import type { DashboardCard, ItemList, ReportBody, ReportDocument, ValidationIssue } from '@xihan-report/core'
import type { ReportDesignerTranslations } from '@xihan-report/runtime'
import type { DesignerIssueItem, DesignerIssuesEventMap, XhDesignerIssuesElement } from '@xihan-ui/designer-shell'
import type { ReportSelection } from './editor'
import { bodyQuery, cardQuery, cardView, isDataView } from '@xihan-report/core'
import { isPlainObject } from '@xihan-ui/core/json'
import { createGeneratedElement } from '@xihan-ui/web-components/authoring'

const ITEM_LISTS: readonly ItemList[] = ['columns', 'groups', 'rows', 'measures', 'dimensions', 'series']

const NOTHING: ReportSelection = { cards: [] }

function isItemList(value: unknown): value is ItemList {
  return ITEM_LISTS.includes(value as ItemList)
}

/** 数组里位置 index 上的那一项；不是数组或下标不是数字时为 undefined。 */
function itemAt(list: unknown, index: unknown): unknown {
  return Array.isArray(list) && typeof index === 'number' ? list[index] : undefined
}

/** 对象上 key 处的字符串；不是对象或不是字符串时为 undefined。 */
function stringOf(value: unknown, key: string): string | undefined {
  const found = isPlainObject(value) ? value[key] : undefined
  return typeof found === 'string' ? found : undefined
}

/** 对象里列表 list 在位置 index 上那一项的 id。 */
function itemIdAt(owner: unknown, list: unknown, index: unknown): string | undefined {
  return isPlainObject(owner) && isItemList(list) ? stringOf(itemAt(owner[list], index), 'id') : undefined
}

/** 数组里 key 等于 id 的那一项的标题。 */
function titleIn(list: unknown, key: 'id' | 'name', id: string): string | undefined {
  return stringOf(Array.isArray(list) ? list.find(entry => stringOf(entry, key) === id) : undefined, 'title')
}

/** 列表项的选择：指到了带 id 的列表项时选中它，否则只选所在卡片。 */
function itemSelection(card: string | undefined, owner: unknown, list: unknown, index: unknown): ReportSelection {
  const id = itemIdAt(owner, list, index)
  const cards = card === undefined ? [] : [card]
  if (id === undefined || !isItemList(list))
    return { cards }
  return { cards, item: card === undefined ? { list, id } : { card, list, id } }
}

/** 主体（明细表、分组报表、交叉表或扩展视图）里问题路径 rest 指向的列表项。 */
function bodySelection(body: ReportBody, rest: readonly unknown[]): ReportSelection {
  if (isDataView(body))
    return itemSelection(undefined, body, rest[0], rest[1])
  return rest[0] === 'query' ? itemSelection(undefined, bodyQuery(body)?.query, rest[1], rest[2]) : NOTHING
}

/** 卡片里问题路径 rest 指向的选择：卡片，或它的视图、查询与柱线图系列里的列表项。 */
function cardSelection(card: DashboardCard, rest: readonly unknown[]): ReportSelection {
  const [container, list, index] = rest
  const owner = container === 'view'
    ? cardView(card)
    : container === 'query' ? cardQuery(card)?.query : container === 'chart' && list === 'series' && card.kind === 'chart' ? card.chart : undefined
  return itemSelection(card.id, owner, list, index)
}

/**
 * 问题路径指向的选择：最内层能选中的对象；指向文档本身时为空选择。
 * 文档可以是还没校验过的任意 JSON（如 JSON 编辑框里的），路径上的对象缺了或形状不对时停在能找到的那一层。
 */
export function issueSelection(document: unknown, issue: ValidationIssue): ReportSelection {
  if (!isPlainObject(document))
    return NOTHING
  const [head, ...rest] = issue.path
  if (head === 'datasets') {
    const dataset = itemAt(document.datasets, rest[0])
    const id = stringOf(dataset, 'id')
    if (id === undefined)
      return NOTHING
    const field = rest[1] === 'fields' && isPlainObject(dataset) ? stringOf(itemAt(dataset.fields, rest[2]), 'name') : undefined
    return { cards: [], data: field === undefined ? { kind: 'dataset', dataset: id } : { kind: 'field', dataset: id, name: field } }
  }
  if (head === 'parameters') {
    const name = stringOf(itemAt(document.parameters, rest[0]), 'name')
    return name === undefined ? NOTHING : { cards: [], data: { kind: 'parameter', name } }
  }
  const body = document.body
  if (head !== 'body' || !isPlainObject(body) || typeof body.type !== 'string')
    return NOTHING
  if (body.type !== 'dashboard')
    return bodySelection(body as unknown as ReportBody, rest)
  if (rest[0] === 'links') {
    const link = itemAt(body.links, rest[1])
    const id = stringOf(link, 'id')
    const card = stringOf(link, 'card')
    return id === undefined || card === undefined ? NOTHING : { cards: [card], link: id }
  }
  const card = rest[0] === 'cards' ? itemAt(body.cards, rest[1]) : undefined
  return stringOf(card, 'id') === undefined ? NOTHING : cardSelection(card as DashboardCard, rest.slice(2))
}

/** 问题所在对象的名字：卡片、数据集、字段或参数的标题，没有时取 id。 */
function subjectOf(document: unknown, issue: ValidationIssue): string | undefined {
  if (!isPlainObject(document))
    return undefined
  const selection = issueSelection(document, issue)
  const data = selection.data
  if (data?.kind === 'parameter')
    return titleIn(document.parameters, 'name', data.name) ?? data.name
  if (data) {
    if (data.kind === 'field') {
      const dataset = Array.isArray(document.datasets) ? document.datasets.find(item => stringOf(item, 'id') === data.dataset) : undefined
      return titleIn(isPlainObject(dataset) ? dataset.fields : undefined, 'name', data.name) ?? data.name
    }
    return titleIn(document.datasets, 'id', data.dataset) ?? data.dataset
  }
  const id = selection.cards[0]
  const body = document.body
  if (id !== undefined && isPlainObject(body))
    return titleIn(body.cards, 'id', id) ?? id
  return undefined
}

/**
 * 问题列表的条目：问题、换成文字的说明，与所在对象的名字。问题面板与 JSON 编辑框共用；document 是问题所属的那份报表，
 * 可以是还没校验过的任意 JSON。
 */
export function reportIssueItems(document: unknown, issues: readonly ValidationIssue[], t: ReportDesignerTranslations): DesignerIssueItem[] {
  return issues.map((issue): DesignerIssueItem => {
    const subject = subjectOf(document, issue)
    return subject === undefined ? { issue, message: t.issue(issue) } : { issue, message: t.issue(issue), subject }
  })
}

/** 问题列表需要设计器提供的能力。 */
export interface IssuesHost {
  readonly ownerDocument: Document
  readonly document: () => ReportDocument | undefined
  /** 选中问题指向的对象并让它可见。 */
  readonly locate: (selection: ReportSelection) => void
}

export class IssuesPanel {
  readonly element: XhDesignerIssuesElement
  readonly #host: IssuesHost

  constructor(host: IssuesHost) {
    this.#host = host
    this.element = createGeneratedElement(host.ownerDocument, 'xh-designer-issues', { 'data-part': 'issues', 'slot': 'issues', 'group-by': 'target' }) as XhDesignerIssuesElement
    this.element.addEventListener('issue-activate', (event) => {
      const document = this.#host.document()
      if (document)
        this.#host.locate(issueSelection(document, (event as DesignerIssuesEventMap['issue-activate']).detail.issue as ValidationIssue))
    })
  }

  update(document: ReportDocument, issues: readonly ValidationIssue[], t: ReportDesignerTranslations): void {
    this.element.translations = { title: t.issues }
    this.element.items = reportIssueItems(document, issues, t)
  }
}
