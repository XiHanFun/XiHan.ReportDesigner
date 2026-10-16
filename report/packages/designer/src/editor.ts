/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表设计器的编辑模型：在历史栈之上维护选择、看板布局手势、剪贴板与编辑命令；不碰 DOM。

import type {
  DashboardCard,
  DashboardLink,
  DashboardView,
  ItemList,
  NewCard,
  ReportDocument,
  ReportOperation,
  ValidateOptions,
  ValidationIssue,
} from '@xihan-report/core'
import type { JsonPath, JsonValue } from '@xihan-ui/core/json'
import type { DataField, ExecuteOptions, GridRect, History, HistoryChangeKind } from '@xihan-ui/designer-kit'
import { applyOperation, gridItems, planAddCard, planCardLayout, planRemoveCard, planRemoveItem, validateDocument } from '@xihan-report/core'
import { formatJsonPath, isPlainObject } from '@xihan-ui/core/json'
import { createHistory, createIdAllocator, decodeClipboard, encodeClipboard, remapIds } from '@xihan-ui/designer-kit'

/** 剪贴板包的产品名与版本。 */
export const REPORT_CLIPBOARD_PRODUCT = 'xihan-report'
export const REPORT_CLIPBOARD_VERSION = 1

/** 选中的列表项：报表主体或卡片里某个列表的一项（列、分组、维度、度量、系列）。 */
export interface ReportItemRef {
  readonly card?: string
  readonly list: ItemList
  readonly id: string
}

/** 数据面板里选中的对象：数据集、数据集的字段或报表参数。 */
export type ReportDataRef
  = | { readonly kind: 'dataset', readonly dataset: string }
    | { readonly kind: 'field', readonly dataset: string, readonly name: string }
    | { readonly kind: 'parameter', readonly name: string }

/** 选择：看板上的卡片，以及可选的一个列表项；或者数据面板里的一个对象，这时不选卡片与列表项。 */
export interface ReportSelection {
  readonly cards: readonly string[]
  readonly item?: ReportItemRef
  readonly data?: ReportDataRef
}

/** 选择方式：替换、追加或切换。 */
export type ReportSelectMode = 'replace' | 'add' | 'toggle'

/** 剪贴板里的内容：卡片，以及源卡片与目标都在其中的联动。 */
export interface ReportClipboard {
  readonly cards: readonly DashboardCard[]
  readonly links: readonly DashboardLink[]
}

/** 编辑模型的变化：文档变化带上历史变化的种类与实际应用的操作；选择变化带上新的选择。 */
export type ReportEditorChange
  = | { readonly kind: 'document', readonly cause: HistoryChangeKind, readonly document: ReportDocument, readonly operations: readonly ReportOperation[] }
    | { readonly kind: 'selection', readonly selection: ReportSelection }

export interface ReportEditorOptions {
  readonly document: ReportDocument
  /** 撤销步数上限，缺省 100。 */
  readonly historyLimit?: number
  /** 同一合并键相隔多少毫秒内并入上一步，缺省 1000。 */
  readonly mergeWithin?: number
  readonly now?: () => number
}

/**
 * 卡片拖动或改大小的手势：开始时开事务，move 每次都按手势开始时的布局重算并写进事务，
 * end 提交为一步撤销，cancel 回滚到手势开始前。结束之后再调用什么都不做。
 */
export interface LayoutGesture {
  readonly move: (id: string, target: Partial<GridRect>) => void
  readonly end: () => void
  readonly cancel: () => void
}

/** 新增卡片的参数：id 缺省时按卡片种类分配，layout 只写大小时放到第一个空位。 */
export type ReportAddCardInit = NewCard extends infer C ? C extends NewCard ? Omit<C, 'id'> & { readonly id?: string } : never : never

export interface ReportEditor {
  readonly document: ReportDocument
  readonly history: History<ReportDocument, ReportOperation>
  readonly selection: ReportSelection
  /** 装载新文档：清空历史与选择；文档变化的 cause 为 reset。 */
  readonly load: (document: ReportDocument) => void
  /** 执行一组操作并记为一步撤销（手势事务中并入事务）；返回新文档。 */
  readonly execute: (operations: readonly ReportOperation[], options?: ExecuteOptions) => ReportDocument
  readonly undo: () => boolean
  readonly redo: () => boolean
  /** 封口：此后带同一合并键的修改另起一步。 */
  readonly seal: () => void
  readonly select: (selection: Partial<ReportSelection>, mode?: ReportSelectMode) => void
  /** 选中看板上的全部卡片。 */
  readonly selectAll: () => void
  readonly clearSelection: () => void
  /** 新增卡片并选中它；报表主体不是看板或 id 已存在时抛错。 */
  readonly addCard: (init: ReportAddCardInit, options?: ExecuteOptions) => DashboardCard
  /** 删除选中的列表项，没有时删除选中的卡片（连带清理联动并压实）；什么都没选中时返回 false。 */
  readonly deleteSelection: (options?: ExecuteOptions) => boolean
  /** 开始拖动或改大小卡片；报表主体不是看板时抛错。 */
  readonly startLayout: (label?: string) => LayoutGesture
  /** 编辑模型里留着可粘贴的内容。 */
  readonly hasClipboard: boolean
  /** 复制选中的卡片与源卡片、目标都在其中的联动，留作下一次 paste 的内容；没有选中卡片时为 undefined。 */
  readonly copy: () => ReportClipboard | undefined
  /** 复制并删除选中的卡片。 */
  readonly cut: (options?: ExecuteOptions) => ReportClipboard | undefined
  /**
   * 粘贴卡片，不给 clipboard 时用最近一次复制的内容：id 与别的卡片重复时换新 id（联动随之改写），各卡片放到第一个空位，
   * 选中粘贴出的卡片并返回新的选择。没有内容或报表主体不是看板时不改文档，返回空选择。
   */
  readonly paste: (clipboard?: ReportClipboard, options?: ExecuteOptions) => ReportSelection
  /** 复制选中的卡片并立即粘贴，不改动留着的内容。 */
  readonly duplicate: (options?: ExecuteOptions) => ReportSelection
  /** 数据集的可绑定字段树（designer-kit 的 DataField）；数据集不存在时为空数组。 */
  readonly dataFields: (dataset: string) => DataField[]
  readonly validate: (options?: ValidateOptions) => ValidationIssue[]
  readonly subscribe: (listener: (change: ReportEditorChange) => void) => () => void
}

const EMPTY_SELECTION: ReportSelection = { cards: [] }

/** 属性面板连续输入的合并键：同一对象、同一路径的修改并入一步。 */
export function propertyMergeKey(owner: string, path: JsonPath): string {
  return `prop:${owner}:${formatJsonPath(path)}`
}

function dashboardOf(document: ReportDocument): DashboardView | undefined {
  return document.body.type === 'dashboard' ? document.body : undefined
}

function requireDashboard(document: ReportDocument): DashboardView {
  const dashboard = dashboardOf(document)
  if (!dashboard)
    throw new RangeError('[xh-report-designer] the report body is not a dashboard')
  return dashboard
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isCard(value: unknown): value is DashboardCard {
  return isPlainObject(value) && typeof value.id === 'string' && value.id !== '' && typeof value.kind === 'string' && isPlainObject(value.layout)
}

function isLink(value: unknown): value is DashboardLink {
  return isPlainObject(value) && typeof value.id === 'string' && typeof value.card === 'string' && Array.isArray(value.targets)
}

/** 从剪贴板文本读出卡片与联动；不是报表的剪贴板、版本不支持或内容不合格时为 undefined。 */
export function readReportClipboard(text: string): ReportClipboard | undefined {
  const decoded = decodeClipboard(text, REPORT_CLIPBOARD_PRODUCT)
  if (!decoded.ok || decoded.version !== REPORT_CLIPBOARD_VERSION || !isPlainObject(decoded.payload))
    return undefined
  const { cards, links } = decoded.payload as { cards?: unknown, links?: unknown }
  if (!Array.isArray(cards) || cards.length === 0 || !cards.every(isCard) || !Array.isArray(links) || !links.every(isLink))
    return undefined
  return { cards, links }
}

/** 把卡片与联动写成剪贴板文本。 */
export function writeReportClipboard(clipboard: ReportClipboard): string {
  return encodeClipboard(REPORT_CLIPBOARD_PRODUCT, REPORT_CLIPBOARD_VERSION, clipboard as unknown as JsonValue)
}

/** 创建报表编辑模型。 */
export function createReportEditor(options: ReportEditorOptions): ReportEditor {
  const history = createHistory<ReportDocument, ReportOperation>({
    document: options.document,
    apply: applyOperation,
    limit: options.historyLimit ?? 100,
    mergeWithin: options.mergeWithin ?? 1000,
    ...(options.now === undefined ? {} : { now: options.now }),
  })
  const listeners = new Set<(change: ReportEditorChange) => void>()
  let selection: ReportSelection = EMPTY_SELECTION
  let clipboard: ReportClipboard | undefined

  const emit = (change: ReportEditorChange): void => {
    for (const listener of listeners)
      listener(change)
  }

  const setSelection = (next: ReportSelection): void => {
    if (next.cards.length === selection.cards.length && next.cards.every((id, i) => id === selection.cards[i]) && JSON.stringify(next.item) === JSON.stringify(selection.item) && JSON.stringify(next.data) === JSON.stringify(selection.data))
      return
    selection = next
    emit({ kind: 'selection', selection })
  }

  /** 文档变了之后，去掉已不存在的卡片、列表项与数据面板对象。 */
  const pruneSelection = (document: ReportDocument): void => {
    if (selection.data) {
      if (!dataExists(document, selection.data))
        setSelection(EMPTY_SELECTION)
      return
    }
    const dashboard = dashboardOf(document)
    const ids = new Set(dashboard?.cards.map(card => card.id) ?? [])
    const cards = selection.cards.filter(id => ids.has(id))
    const item = selection.item && itemExists(document, selection.item) ? selection.item : undefined
    setSelection(item ? { cards, item } : { cards })
  }

  history.subscribe((change) => {
    emit({ kind: 'document', cause: change.kind, document: change.document, operations: change.operations })
    pruneSelection(change.document)
  })

  const execute = (operations: readonly ReportOperation[], executeOptions?: ExecuteOptions): ReportDocument => history.execute(operations, executeOptions)

  const clipboardOf = (ids: readonly string[]): ReportClipboard | undefined => {
    const dashboard = dashboardOf(history.document)
    if (!dashboard || ids.length === 0)
      return undefined
    const chosen = new Set(ids)
    const cards = dashboard.cards.filter(card => chosen.has(card.id))
    if (cards.length === 0)
      return undefined
    const links = (dashboard.links ?? [])
      .filter(link => chosen.has(link.card))
      .map(link => ({ ...link, targets: link.targets.filter(target => chosen.has(target.card)) }))
      .filter(link => link.targets.length > 0)
    return clone({ cards, links })
  }

  const pasteClipboard = (clipboard: ReportClipboard, executeOptions?: ExecuteOptions): ReportSelection => {
    const dashboard = dashboardOf(history.document)
    if (!dashboard || clipboard.cards.length === 0)
      return EMPTY_SELECTION
    const takenCards = new Set(dashboard.cards.map(card => card.id))
    const cardIds = createIdAllocator('card', takenCards)
    const cardMap = remapIds(clipboard.cards.map(card => card.id), (id) => {
      if (!takenCards.has(id)) {
        cardIds.reserve(id)
        return id
      }
      return cardIds.next()
    })
    const takenLinks = new Set((dashboard.links ?? []).map(link => link.id))
    const linkIds = createIdAllocator('link', takenLinks)
    const linkMap = remapIds(clipboard.links.map(link => link.id), (id) => {
      if (!takenLinks.has(id)) {
        linkIds.reserve(id)
        return id
      }
      return linkIds.next()
    })
    const pasted: string[] = []
    history.transact(() => {
      for (const card of clipboard.cards) {
        const id = cardMap.get(card.id)!
        const { w, h } = card.layout
        execute(planAddCard(requireDashboard(history.document), { ...clone(card), id, layout: { w, h } } as NewCard), executeOptions)
        pasted.push(id)
      }
      for (const link of clipboard.links) {
        execute([{
          type: 'addLink',
          link: { ...clone(link), id: linkMap.get(link.id)!, card: cardMap.get(link.card)!, targets: link.targets.map(target => ({ ...target, card: cardMap.get(target.card)! })) },
        }], executeOptions)
      }
    }, executeOptions?.label)
    const next = { cards: pasted }
    setSelection(next)
    return next
  }

  const editor: ReportEditor = {
    get document() {
      return history.document
    },
    history,
    get selection() {
      return selection
    },
    load(document) {
      history.reset(document)
      setSelection(EMPTY_SELECTION)
    },
    execute,
    undo: () => history.undo(),
    redo: () => history.redo(),
    seal: () => history.seal(),
    select(next, mode = 'replace') {
      if (next.data) {
        setSelection({ cards: [], data: next.data })
        return
      }
      const cards = next.cards ?? []
      if (mode === 'replace') {
        setSelection(next.item ? { cards: [...cards], item: next.item } : { cards: [...cards] })
        return
      }
      const current = new Set(selection.cards)
      for (const id of cards) {
        if (mode === 'toggle' && current.has(id))
          current.delete(id)
        else
          current.add(id)
      }
      const item = next.item ?? selection.item
      setSelection(item ? { cards: [...current], item } : { cards: [...current] })
    },
    selectAll() {
      const dashboard = dashboardOf(history.document)
      setSelection({ cards: dashboard ? dashboard.cards.map(card => card.id) : [] })
    },
    clearSelection: () => setSelection(EMPTY_SELECTION),
    addCard(init, executeOptions) {
      const dashboard = requireDashboard(history.document)
      const id = init.id ?? createIdAllocator(init.kind, dashboard.cards.map(card => card.id)).next()
      execute(planAddCard(dashboard, { ...init, id } as NewCard), executeOptions)
      setSelection({ cards: [id] })
      return requireDashboard(history.document).cards.find(card => card.id === id)!
    },
    deleteSelection(executeOptions) {
      if (selection.item) {
        const { card, list, id } = selection.item
        execute(planRemoveItem(history.document, card === undefined ? {} : { card }, list, id), executeOptions)
        return true
      }
      if (selection.cards.length === 0 || !dashboardOf(history.document))
        return false
      const ids = [...selection.cards]
      history.transact(() => {
        for (const id of ids)
          execute(planRemoveCard(requireDashboard(history.document), id), executeOptions)
      }, executeOptions?.label)
      return true
    },
    startLayout(label) {
      const from = gridItems(requireDashboard(history.document))
      history.begin(label)
      let open = true
      return {
        move(id, target) {
          if (open)
            execute(planCardLayout(requireDashboard(history.document), id, target, { from }))
        },
        end() {
          if (!open)
            return
          open = false
          history.commit()
        },
        cancel() {
          if (!open)
            return
          open = false
          history.rollback()
        },
      }
    },
    get hasClipboard() {
      return clipboard !== undefined
    },
    copy() {
      const copied = clipboardOf(selection.cards)
      if (copied)
        clipboard = copied
      return copied
    },
    cut(executeOptions) {
      const copied = editor.copy()
      if (copied)
        editor.deleteSelection(executeOptions)
      return copied
    },
    paste(content, executeOptions) {
      const source = content ?? clipboard
      return source ? pasteClipboard(source, executeOptions) : EMPTY_SELECTION
    },
    duplicate(executeOptions) {
      const copied = clipboardOf(selection.cards)
      return copied ? pasteClipboard(copied, executeOptions) : EMPTY_SELECTION
    },
    dataFields(datasetId) {
      const dataset = history.document.datasets.find(item => item.id === datasetId)
      return dataset ? dataset.fields.map(field => (field.title === undefined ? { name: field.name, kind: 'value' } : { name: field.name, label: field.title, kind: 'value' })) : []
    },
    validate: validateOptions => validateDocument(history.document, validateOptions),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return editor
}

/** 列表项是否还在文档里。 */
function dataExists(document: ReportDocument, ref: ReportDataRef): boolean {
  if (ref.kind === 'parameter')
    return document.parameters?.some(parameter => parameter.name === ref.name) ?? false
  const dataset = document.datasets.find(item => item.id === ref.dataset)
  return ref.kind === 'dataset' ? dataset !== undefined : dataset?.fields.some(field => field.name === ref.name) ?? false
}

function itemExists(document: ReportDocument, ref: ReportItemRef): boolean {
  let owner: unknown
  if (ref.card === undefined) {
    owner = document.body
  }
  else {
    const card = dashboardOf(document)?.cards.find(item => item.id === ref.card)
    owner = card?.kind === 'table' ? card.view : ref.list === 'series' ? (card as { chart?: unknown } | undefined)?.chart : (card as { query?: unknown } | undefined)?.query
  }
  const list = isPlainObject(owner) ? (owner as Record<string, unknown>)[ref.list] : undefined
  return Array.isArray(list) && list.some(item => isPlainObject(item) && item.id === ref.id)
}
