/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 字段栏：编辑对象（报表主体的视图，或选中的那张卡片）的各个列表，一个列表一个 <xh-sortable>，项是可移除的 <xh-tag>。
// 列表内拖动排序；交叉表的行与列同组，在两者之间拖动即透视。从数据面板拖来的字段按落点插进列表。
// 看板卡片下另有一段联动：以它为源的联动各是一枚可移除的标签，点选后在属性面板里编辑，也可以新增。

import type { ChartSpec, DashboardCard, DataView, FieldType, ItemList, ItemOwner, ReportCoreExtension, ReportDocument, ReportOperation, ReportQuery } from '@xihan-report/core'
import type { ReportDesignerTranslations } from '@xihan-report/runtime'
import type { DropOver } from '@xihan-ui/designer-shell'
import type { XhSortableElement, XhTagElement } from '@xihan-ui/web-components/define'
import type { ReportItemRef, ReportSelection } from './editor'
import { applyOperations, bodyQuery, cardQuery, cardView, isDataView, planAddFieldItem, planFillBindings, planRemoveItem } from '@xihan-report/core'
import { createIdAllocator } from '@xihan-ui/designer-kit'
import { registerDropTarget } from '@xihan-ui/designer-shell'
import { createAuthoredElement, createGeneratedElement, setText } from '@xihan-ui/web-components/authoring'
import { dataFieldPayload } from './data-panel'
import { linkableDimensions } from './link-sources'

/**
 * 字段栏的编辑对象：报表主体（card 缺省）或一张卡片的视图或查询，两者有且只有一个。视图属于明细表、分组报表、交叉表、
 * 表格卡片或取数形状为 view 的扩展卡片；查询属于图表与指标卡片、取数形状为 query 的扩展卡片与扩展视图。
 */
export interface WellsOwner {
  readonly card?: string
  readonly dataset: string
  readonly view?: DataView
  readonly query?: ReportQuery
  /** 直角坐标图的图表配置：另有系列一栏。 */
  readonly chart?: ChartSpec
}

/** 列表里的一项。 */
export interface WellItem {
  readonly id: string
  readonly label: string
}

/** 一个列表：名字、文案键与项。 */
export interface WellList {
  readonly list: ItemList
  readonly label: string
  readonly items: readonly WellItem[]
  /** 能接受从数据面板拖来的字段。 */
  readonly droppable: boolean
}

/** 字段栏需要设计器提供的能力。 */
export interface WellsHost {
  readonly ownerDocument: Document
  readonly document: () => ReportDocument | undefined
  readonly execute: (operations: readonly ReportOperation[]) => void
  readonly selectItem: (ref: ReportItemRef) => void
  /** 选中以 card 为源的联动。 */
  readonly selectLink: (card: string, id: string) => void
  readonly isReadonly: () => boolean
  /** 设计器装的扩展：扩展卡片的绑定补全取自它的种类。 */
  readonly extensions: () => readonly ReportCoreExtension[]
}

/** 字段直接拖到卡片或主体视图上时进哪个列表：数值字段进度量（明细表、分组报表进列），其余进维度、交叉表的行或列。 */
export function fieldList(owner: WellsOwner, type: FieldType): ItemList {
  if (owner.view) {
    if (owner.view.type === 'crosstab')
      return type === 'number' ? 'measures' : 'rows'
    return 'columns'
  }
  return type === 'number' ? 'measures' : 'dimensions'
}

/** 在操作之后补全卡片的必填绑定（planFillBindings，按 extensions 里登记的种类），与操作合为一组；不是卡片时原样返回。 */
export function withFilledBindings(document: ReportDocument, owner: ItemOwner, operations: readonly ReportOperation[], extensions: readonly ReportCoreExtension[]): ReportOperation[] {
  if (owner.card === undefined || operations.length === 0)
    return [...operations]
  return [...operations, ...planFillBindings(applyOperations(document, operations).document, owner.card, { extensions })]
}

/** 卡片上能作联动源的维度与标题。 */
function linkSources(card: DashboardCard | undefined): readonly WellItem[] {
  return linkableDimensions(card).map(item => ({ id: item.id, label: item.title ?? item.field ?? item.id }))
}

/** 报表主体不是看板时，主体的视图或查询；是看板或没有可编辑的列表时为 undefined。 */
export function bodyOwner(document: ReportDocument): WellsOwner | undefined {
  const body = document.body
  if (body.type === 'dashboard')
    return undefined
  if (isDataView(body))
    return { dataset: body.dataset, view: body }
  const query = bodyQuery(body)
  return query ? { dataset: query.dataset, query: query.query } : undefined
}

/** 一张卡片的视图或查询；没有取数的卡片为 undefined。 */
export function cardOwner(card: DashboardCard): WellsOwner | undefined {
  const view = cardView(card)
  if (view)
    return { card: card.id, dataset: view.dataset, view }
  const query = cardQuery(card)
  if (!query)
    return undefined
  return card.kind === 'chart' && card.chart.type === 'cartesian'
    ? { card: card.id, dataset: query.dataset, query: query.query, chart: card.chart }
    : { card: card.id, dataset: query.dataset, query: query.query }
}

/** 字段栏的编辑对象：主体不是看板时是主体的视图；是看板时是唯一选中的那张卡片，否则没有。 */
export function wellsOwner(document: ReportDocument, selection: ReportSelection): WellsOwner | undefined {
  const body = document.body
  if (body.type !== 'dashboard')
    return bodyOwner(document)
  if (selection.cards.length !== 1)
    return undefined
  const card = body.cards.find(item => item.id === selection.cards[0])
  return card && cardOwner(card)
}

/** 编辑对象的各个列表与项：视图是列、分组或行列度量，查询是维度、度量，直角坐标图另有系列。 */
export function ownerLists(document: ReportDocument, owner: WellsOwner, t: ReportDesignerTranslations): WellList[] {
  const fields = new Map(document.datasets.find(dataset => dataset.id === owner.dataset)?.fields.map(field => [field.name, field.title ?? field.name]) ?? [])
  const named = (item: { readonly id: string, readonly title?: string, readonly field?: string }): WellItem => ({
    id: item.id,
    label: item.title ?? (item.field === undefined ? undefined : fields.get(item.field) ?? item.field) ?? item.id,
  })
  const list = (name: ItemList, key: string, items: readonly WellItem[], droppable = true): WellList => ({ list: name, label: t.lists[key] ?? key, items, droppable })
  const view = owner.view
  if (view) {
    if (view.type === 'table')
      return [list('columns', 'tableColumns', view.columns.map(named))]
    if (view.type === 'group')
      return [list('groups', 'groups', view.groups.map(named)), list('columns', 'tableColumns', view.columns.map(named))]
    return [list('rows', 'rows', view.rows.map(named)), list('columns', 'columns', view.columns.map(named)), list('measures', 'measures', view.measures.map(named))]
  }
  const query = owner.query!
  const lists = [list('dimensions', 'dimensions', query.dimensions.map(named)), list('measures', 'measures', query.measures.map(named))]
  if (owner.chart?.type === 'cartesian') {
    const measures = new Map(lists[1]!.items.map(item => [item.id, item.label]))
    lists.push(list('series', 'series', owner.chart.series.map(series => ({
      id: series.id,
      label: series.name ?? (typeof series.y === 'string' ? measures.get(series.y) : undefined) ?? series.id,
    })), false))
  }
  return lists
}

interface RenderedWell {
  readonly element: HTMLElement
  readonly sortable: XhSortableElement
  readonly root: HTMLElement
  readonly empty: HTMLElement
  readonly items: Map<string, HTMLElement>
  key: string
}

export class Wells {
  readonly element: HTMLElement
  readonly #host: WellsHost
  readonly #hint: HTMLElement
  readonly #lists: HTMLElement
  readonly #links: HTMLElement
  readonly #linksLabel: HTMLElement
  readonly #linkTags: HTMLElement
  readonly #addLink: HTMLElement
  #linksKey = ''
  #owner: WellsOwner | undefined
  #wells = new Map<ItemList, RenderedWell>()
  #ownerKey = ''
  #ids = 0

  constructor(host: WellsHost) {
    this.#host = host
    const doc = host.ownerDocument
    this.#hint = createAuthoredElement(doc, 'p', { 'data-part': 'wells-hint' })
    this.#lists = createAuthoredElement(doc, 'div', { 'data-part': 'well-lists' })
    this.#linksLabel = createAuthoredElement(doc, 'span', { 'data-part': 'well-label' })
    this.#linkTags = createAuthoredElement(doc, 'div', { 'data-part': 'well-link-tags' })
    const addButton = createAuthoredElement(doc, 'button', { 'data-xh-part': 'root', 'type': 'button' })
    this.#addLink = createAuthoredElement(doc, 'xh-button', { 'variant': 'ghost', 'size': 'sm', 'data-part': 'well-add-link' }, [addButton])
    addButton.addEventListener('click', () => this.#createLink())
    this.#links = createAuthoredElement(doc, 'div', { 'data-part': 'well-links', 'hidden': true }, [this.#linksLabel, this.#linkTags, this.#addLink])
    this.element = createGeneratedElement(doc, 'div', { 'data-part': 'wells', 'slot': 'wells' }, [this.#hint, this.#lists, this.#links])
  }

  /** 按文档与选择重排：编辑对象或列表的结构变了才重建该列表的标记；选中的项带 data-selected。deleteLabel 是移除钮名字前的「删除」。 */
  update(document: ReportDocument, selection: ReportSelection, t: ReportDesignerTranslations, deleteLabel: string): void {
    const owner = wellsOwner(document, selection)
    this.#owner = owner
    setText(this.#hint, t.wellsEmpty)
    this.#hint.hidden = owner !== undefined
    const lists = owner ? ownerLists(document, owner, t) : []
    const ownerKey = JSON.stringify([owner?.card, owner?.view?.type, lists.map(list => list.list)])
    if (ownerKey !== this.#ownerKey) {
      this.#ownerKey = ownerKey
      const pivot = owner?.view?.type === 'crosstab'
      this.#wells = new Map(lists.map(list => [list.list, this.#createWell(list.list, pivot)]))
      this.#lists.replaceChildren(...[...this.#wells.values()].map(well => well.element))
    }
    const readonly = this.#host.isReadonly()
    for (const list of lists)
      this.#renderWell(this.#wells.get(list.list)!, list, t, readonly, deleteLabel)
    const chosen = selection.item && owner && selection.item.card === owner.card ? selection.item : undefined
    for (const [list, well] of this.#wells) {
      for (const [id, item] of well.items)
        item.toggleAttribute('data-selected', chosen?.list === list && chosen.id === id)
    }
    this.#renderLinks(document, owner, selection, t, readonly, deleteLabel)
  }

  /** 联动一段：只在编辑对象是看板卡片时显示；结构或文案变了才重建标签，选中的那条带 data-selected。 */
  #renderLinks(document: ReportDocument, owner: WellsOwner | undefined, selection: ReportSelection, t: ReportDesignerTranslations, readonly: boolean, deleteLabel: string): void {
    const body = document.body
    const card = owner?.card
    this.#links.hidden = card === undefined || body.type !== 'dashboard'
    if (card === undefined || body.type !== 'dashboard')
      return
    const source = body.cards.find(item => item.id === card)
    const dimensions = new Map(linkSources(source).map(item => [item.id, item.label]))
    const links = (body.links ?? []).filter(link => link.card === card).map(link => ({ id: link.id, label: t.linkLabel(dimensions.get(link.dimension) ?? link.dimension, link.targets.length) }))
    const key = JSON.stringify([card, links, readonly, t.links, t.addLink, deleteLabel])
    if (key !== this.#linksKey) {
      this.#linksKey = key
      const doc = this.#host.ownerDocument
      setText(this.#linksLabel, t.links)
      setText(this.#addLink.querySelector<HTMLElement>('[data-xh-part="root"]')!, t.addLink)
      this.#addLink.hidden = readonly
      this.#linkTags.replaceChildren(...links.map((link) => {
        const tag = createAuthoredElement(doc, 'xh-tag', { 'variant': 'subtle', 'size': 'sm', 'closable': !readonly, 'data-link': link.id }, [
          createAuthoredElement(doc, 'span', { 'data-xh-part': 'root' }, [
            createAuthoredElement(doc, 'span', { 'data-xh-part': 'label' }, [link.label]),
            createAuthoredElement(doc, 'button', { 'data-xh-part': 'close-trigger', 'type': 'button' }),
          ]),
        ]) as XhTagElement
        tag.setAttribute('open', '')
        tag.translations = { close: `${deleteLabel} ${link.label}` }
        tag.addEventListener('open-change', (event) => {
          if ((event as CustomEvent<{ open: boolean }>).detail.open === false && !this.#host.isReadonly())
            this.#host.execute([{ type: 'removeLink', id: link.id }])
        })
        tag.addEventListener('click', (event) => {
          if (!(event.target as Element).closest('[data-xh-part="close-trigger"]'))
            this.#host.selectLink(card, link.id)
        })
        return tag
      }))
    }
    for (const tag of this.#linkTags.querySelectorAll<HTMLElement>('[data-link]'))
      tag.toggleAttribute('data-selected', tag.dataset.link === selection.link)
  }

  /** 新增一条以编辑对象为源的联动：源维度取它的第一个能发出取值的维度，目标留空；选中它。 */
  #createLink(): void {
    const document = this.#host.document()
    const card = this.#owner?.card
    const body = document?.body
    if (card === undefined || body?.type !== 'dashboard' || this.#host.isReadonly())
      return
    const id = createIdAllocator('link', (body.links ?? []).map(link => link.id)).next()
    const dimension = linkSources(body.cards.find(item => item.id === card))[0]?.id ?? ''
    this.#host.execute([{ type: 'addLink', link: { id, card, dimension, targets: [] } }])
    this.#host.selectLink(card, id)
  }

  #createWell(list: ItemList, pivot: boolean): RenderedWell {
    const doc = this.#host.ownerDocument
    const labelId = `xh-report-well-${++this.#ids}`
    const label = createAuthoredElement(doc, 'span', { 'data-part': 'well-label', 'id': labelId })
    const root = createAuthoredElement(doc, 'div', { 'data-xh-part': 'root', 'aria-labelledby': labelId }, [
      createAuthoredElement(doc, 'div', { 'data-xh-part': 'drop-indicator' }),
      createAuthoredElement(doc, 'div', { 'data-xh-part': 'live-region' }),
    ])
    const sortable = createAuthoredElement(doc, 'xh-sortable', pivot && (list === 'rows' || list === 'columns') ? { 'group': 'pivot', 'list-id': list } : {}, [root]) as XhSortableElement
    const empty = createAuthoredElement(doc, 'span', { 'data-part': 'well-empty' })
    const element = createAuthoredElement(doc, 'div', { 'data-part': 'well', 'data-list': list }, [label, sortable, empty])
    sortable.addEventListener('sort', (event) => {
      const { id, to } = (event as CustomEvent<{ id: string, to: number }>).detail
      this.#execute(owner => [{ type: 'moveItem', ...owner, list, id, index: to }])
    })
    sortable.addEventListener('transfer', (event) => {
      const { id, toList, to } = (event as CustomEvent<{ id: string, toList: string, to: number }>).detail
      this.#execute(owner => [{ type: 'moveItem', ...owner, list, id, index: to, to: toList as ItemList }])
    })
    const well: RenderedWell = { element, sortable, root, empty, items: new Map(), key: '' }
    registerDropTarget(element, {
      over: (_point, payload) => this.#dropOver(well, list, payload),
      drop: (point, payload) => this.#drop(well, list, point, payload),
      leave: () => delete element.dataset.drop,
    })
    return well
  }

  #renderWell(well: RenderedWell, list: WellList, t: ReportDesignerTranslations, readonly: boolean, deleteLabel: string): void {
    const key = JSON.stringify([list.label, list.items, readonly, deleteLabel, t.emptyList])
    if (key === well.key)
      return
    well.key = key
    const doc = this.#host.ownerDocument
    setText(well.element.querySelector<HTMLElement>('[data-part="well-label"]')!, list.label)
    setText(well.empty, list.droppable ? t.emptyList : '')
    well.empty.hidden = list.items.length > 0 || !list.droppable
    for (const item of well.items.values())
      item.remove()
    well.items.clear()
    const tail = well.root.querySelector('[data-xh-part="drop-indicator"]')
    for (const entry of list.items) {
      const tag = createAuthoredElement(doc, 'xh-tag', { variant: 'subtle', size: 'sm', closable: !readonly }, [
        createAuthoredElement(doc, 'span', { 'data-xh-part': 'root' }, [
          createAuthoredElement(doc, 'span', { 'data-xh-part': 'label' }, [entry.label]),
          createAuthoredElement(doc, 'button', { 'data-xh-part': 'close-trigger', 'type': 'button' }),
        ]),
      ]) as XhTagElement
      tag.setAttribute('open', '')
      tag.translations = { close: `${deleteLabel} ${entry.label}` }
      tag.addEventListener('open-change', (event) => {
        if ((event as CustomEvent<{ open: boolean }>).detail.open === false)
          this.#execute(owner => planRemoveItem(this.#host.document()!, owner, list.list, entry.id), true)
      })
      const item = createAuthoredElement(doc, 'div', { 'data-xh-part': 'item', 'item-id': entry.id, 'aria-label': entry.label }, [
        createAuthoredElement(doc, 'button', { 'data-xh-part': 'item-drag-trigger', 'item-id': entry.id, 'type': 'button' }),
        tag,
      ])
      item.addEventListener('click', (event) => {
        if (!(event.target as Element).closest('[data-xh-part="close-trigger"]'))
          this.#select(list.list, entry.id)
      })
      item.addEventListener('focusin', () => this.#select(list.list, entry.id))
      well.root.insertBefore(item, tail)
      well.items.set(entry.id, item)
    }
    well.sortable.ids = list.items.map(item => item.id)
    well.sortable.disabled = readonly
  }

  #select(list: ItemList, id: string): void {
    const owner = this.#owner
    if (owner)
      this.#host.selectItem(owner.card === undefined ? { list, id } : { card: owner.card, list, id })
  }

  /** 对编辑对象执行一组操作；fill 为真时之后补全卡片的必填绑定，合为一步撤销。 */
  #execute(build: (owner: ItemOwner) => ReportOperation[], fill = false): void {
    const owner = this.#owner
    const document = this.#host.document()
    if (!owner || !document || this.#host.isReadonly())
      return
    const target: ItemOwner = owner.card === undefined ? {} : { card: owner.card }
    const built = build(target)
    const operations = fill ? withFilledBindings(document, target, built, this.#host.extensions()) : built
    if (operations.length > 0)
      this.#host.execute(operations)
  }

  /** 字段的落点：指针之后的第一项之前，没有时放在末尾。 */
  #indexAt(well: RenderedWell, point: { readonly x: number, readonly y: number }): number {
    const items = [...well.items.values()]
    const index = items.findIndex((item) => {
      const box = item.getBoundingClientRect()
      return point.y < box.top + box.height / 2
    })
    return index < 0 ? items.length : index
  }

  #dropOver(well: RenderedWell, list: ItemList, payload: unknown): DropOver {
    const field = dataFieldPayload(payload)
    const accept = field !== undefined && !this.#host.isReadonly() && this.#owner?.dataset === field.dataset && list !== 'series'
    if (accept)
      well.element.dataset.drop = ''
    else
      delete well.element.dataset.drop
    return { accept }
  }

  #drop(well: RenderedWell, list: ItemList, point: { readonly x: number, readonly y: number }, payload: unknown): void {
    delete well.element.dataset.drop
    const field = dataFieldPayload(payload)
    if (!field)
      return
    const index = this.#indexAt(well, point)
    this.#execute(owner => planAddFieldItem(this.#host.document()!, owner, list, field.field, { index }), true)
  }
}
