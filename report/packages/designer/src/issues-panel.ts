/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 问题列表：校验问题交给 <xh-designer-issues>，按所在对象分组；点问题时按问题的路径选中对应的卡片、列表项、
// 数据集字段或报表参数并滚到它。

import type { ItemList, ReportDocument, ValidationIssue } from '@xihan-report/core'
import type { ReportDesignerTranslations } from '@xihan-report/runtime'
import type { DesignerIssueItem, DesignerIssuesEventMap, XhDesignerIssuesElement } from '@xihan-ui/designer-shell'
import type { ReportSelection } from './editor'
import { bodyQuery, cardQuery, cardView, isDataView } from '@xihan-report/core'
import { createGeneratedElement } from '@xihan-ui/web-components/authoring'

const ITEM_LISTS: readonly ItemList[] = ['columns', 'groups', 'rows', 'measures', 'dimensions', 'series']

function isItemList(value: unknown): value is ItemList {
  return ITEM_LISTS.includes(value as ItemList)
}

/** 有 id 的列表项在位置 index 上的 id。 */
function idAt(list: unknown, index: unknown): string | undefined {
  if (!Array.isArray(list) || typeof index !== 'number')
    return undefined
  const item = list[index] as { readonly id?: unknown } | undefined
  return typeof item?.id === 'string' ? item.id : undefined
}

/** 问题路径指向的选择：最内层能选中的对象；指向文档本身时为空选择。 */
export function issueSelection(document: ReportDocument, issue: ValidationIssue): ReportSelection {
  const [head, ...rest] = issue.path
  if (head === 'datasets') {
    const dataset = document.datasets[rest[0] as number]
    if (!dataset)
      return { cards: [] }
    const field = rest[1] === 'fields' ? dataset.fields[rest[2] as number] : undefined
    return { cards: [], data: field ? { kind: 'field', dataset: dataset.id, name: field.name } : { kind: 'dataset', dataset: dataset.id } }
  }
  if (head === 'parameters') {
    const parameter = document.parameters?.[rest[0] as number]
    return parameter ? { cards: [], data: { kind: 'parameter', name: parameter.name } } : { cards: [] }
  }
  if (head !== 'body')
    return { cards: [] }
  const body = document.body
  if (body.type !== 'dashboard') {
    const [list, index] = isDataView(body) ? rest : rest[0] === 'query' ? rest.slice(1) : []
    const owner = isDataView(body) ? body : bodyQuery(body)?.query
    const id = owner && isItemList(list) ? idAt((owner as unknown as Record<string, unknown>)[list], index) : undefined
    return id !== undefined && isItemList(list) ? { cards: [], item: { list, id } } : { cards: [] }
  }
  if (rest[0] === 'links') {
    const link = body.links?.[rest[1] as number]
    return link ? { cards: [link.card], link: link.id } : { cards: [] }
  }
  if (rest[0] !== 'cards')
    return { cards: [] }
  const card = body.cards[rest[1] as number]
  if (!card)
    return { cards: [] }
  const [container, list, index] = rest.slice(2)
  const owner = container === 'view'
    ? cardView(card)
    : container === 'query' ? cardQuery(card)?.query : container === 'chart' && list === 'series' && card.kind === 'chart' ? card.chart : undefined
  const id = owner && isItemList(list) ? idAt((owner as unknown as Record<string, unknown>)[list], index) : undefined
  return id !== undefined && isItemList(list) ? { cards: [card.id], item: { card: card.id, list, id } } : { cards: [card.id] }
}

/** 问题所在对象的名字：卡片、数据集、字段或参数的标题，没有时取 id。 */
function subjectOf(document: ReportDocument, issue: ValidationIssue): string | undefined {
  const selection = issueSelection(document, issue)
  const data = selection.data
  if (data?.kind === 'parameter')
    return document.parameters?.find(parameter => parameter.name === data.name)?.title ?? data.name
  if (data) {
    const dataset = document.datasets.find(item => item.id === data.dataset)
    if (data.kind === 'field')
      return dataset?.fields.find(field => field.name === data.name)?.title ?? data.name
    return dataset?.title ?? data.dataset
  }
  const body = document.body
  const id = selection.cards[0]
  if (id !== undefined && body.type === 'dashboard')
    return body.cards.find(card => card.id === id)?.title ?? id
  return undefined
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
    this.element.items = issues.map((issue): DesignerIssueItem => {
      const subject = subjectOf(document, issue)
      return subject === undefined ? { issue, message: t.issue(issue) } : { issue, message: t.issue(issue), subject }
    })
  }
}
