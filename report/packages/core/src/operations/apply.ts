/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 执行编辑操作：找到操作指向的对象，换成 @xihan-ui/designer-kit 的路径编辑操作执行，再写出带报表语义的逆操作。

import type { JsonPath } from '@xihan-ui/core/json'
import type { PathOperation } from '@xihan-ui/designer-kit'
import type { JsonValue, ReportDocument } from '../schema'
import type { CardLayout } from '../schema/view'
import type {
  AddCardOperation,
  AddDatasetOperation,
  AddFieldOperation,
  AddItemOperation,
  AddLinkOperation,
  AddParameterOperation,
  ItemList,
  LayoutCardsOperation,
  MoveItemOperation,
  PropertyChange,
  ReportOperation,
  ReportOperationResult,
  SetBodyOperation,
} from './types'
import { getJsonAt, isPlainObject, jsonEquals } from '@xihan-ui/core/json'
import { applyInSequence } from '@xihan-ui/designer-kit'
import { ReportOperationError } from './errors'
import { checkUniqueKey, copyValue, itemKey, runPath, writeChanges } from './path'

const DOCUMENT_PROTECTED = ['schemaVersion', 'datasets', 'parameters', 'body'] as const
const DATASET_PROTECTED = ['id', 'fields'] as const
const DASHBOARD_PROTECTED = ['type', 'cards', 'links'] as const
const CARD_PROTECTED = ['id', 'kind', 'layout'] as const
const VIEW_PROTECTED = ['type'] as const
const NONE: readonly string[] = []

/** 各视图类型可以增删换序的列表。 */
const VIEW_LISTS: Readonly<Record<string, readonly ItemList[]>> = {
  table: ['columns'],
  group: ['groups', 'columns'],
  crosstab: ['rows', 'columns', 'measures'],
}

/** 可以互相移动列表项的列表：交叉表的行维度与列维度。 */
const PIVOT_LISTS: readonly ItemList[] = ['rows', 'columns']

function unchanged(document: ReportDocument): ReportOperationResult {
  return { document, inverse: [] }
}

function json(document: ReportDocument): JsonValue {
  return document as unknown as JsonValue
}

function asDocument(value: JsonValue): ReportDocument {
  return value as unknown as ReportDocument
}

/** 依次执行路径操作，返回新文档。 */
function run(document: ReportDocument, paths: readonly PathOperation[], operation: ReportOperation): ReportDocument {
  let current = json(document)
  for (const path of paths)
    current = runPath(current, path, operation).document
  return asDocument(current)
}

function arrayAt(document: ReportDocument, path: JsonPath): readonly JsonValue[] | undefined {
  const value = getJsonAt(json(document), path)
  return Array.isArray(value) ? value : undefined
}

function requireIndex(array: readonly JsonValue[] | undefined, key: string, operation: ReportOperation): number {
  const index = array ? array.findIndex(item => itemKey(item) === key) : -1
  if (index < 0)
    throw new ReportOperationError('not-found', operation)
  return index
}

function insertIndex(index: number | undefined, length: number, operation: ReportOperation): number {
  if (index === undefined)
    return length
  if (!Number.isInteger(index) || index < 0 || index > length)
    throw new ReportOperationError('index-out-of-range', operation)
  return index
}

function moveIndex(index: number, length: number, operation: ReportOperation): number {
  if (!Number.isInteger(index) || index < 0 || index >= length)
    throw new ReportOperationError('index-out-of-range', operation)
  return index
}

/** 新增的项：纯 JSON 对象，带非空的键（id，没有 id 时取 name）。 */
function newItem(item: unknown, operation: ReportOperation): JsonValue {
  const key = itemKey(item)
  if (!isPlainObject(item) || key === undefined || key === '')
    throw new ReportOperationError('invalid-value', operation)
  return copyValue(item as JsonValue, operation)
}

/**
 * 在数组里插入一项，数组不存在时补出（只用于可省略的数组）；返回新文档与插入处的下标。
 */
function insertItem(document: ReportDocument, path: JsonPath, item: unknown, index: number | undefined, operation: ReportOperation, optional = false): { document: ReportDocument, index: number } {
  const value = newItem(item, operation)
  const array = arrayAt(document, path)
  if (array === undefined) {
    if (!optional || getJsonAt(json(document), path) !== undefined)
      throw new ReportOperationError('invalid-target', operation)
    insertIndex(index, 0, operation)
    return { document: run(document, [{ type: 'set', path, value: [value] }], operation), index: 0 }
  }
  checkUniqueKey(array, value, -1, operation)
  const at = insertIndex(index, array.length, operation)
  return { document: run(document, [{ type: 'insert', path, index: at, value }], operation), index: at }
}

/** 删除数组项；optional 的数组删到一个不剩时去掉这个属性。返回新文档与被删的项。 */
function removeItem(document: ReportDocument, path: JsonPath, key: string, operation: ReportOperation, optional = false): { document: ReportDocument, item: JsonValue, index: number } {
  const array = arrayAt(document, path)
  const index = requireIndex(array, key, operation)
  const item = array![index]!
  const remove: PathOperation = optional && array!.length === 1 ? { type: 'remove', path } : { type: 'remove', path: [...path, index] }
  return { document: run(document, [remove], operation), item, index }
}

function moveItem(document: ReportDocument, path: JsonPath, key: string, index: number, operation: ReportOperation): { document: ReportDocument, from: number } {
  const array = arrayAt(document, path)
  const from = requireIndex(array, key, operation)
  const to = moveIndex(index, array!.length, operation)
  if (from === to)
    return { document, from }
  return { document: run(document, [{ type: 'move', path: [...path, from], index: to }], operation), from }
}

/** 写属性修改；返回新文档与逆修改。 */
function update(document: ReportDocument, base: JsonPath, changes: readonly PropertyChange[], protectedKeys: readonly string[], operation: ReportOperation): { document: ReportDocument, undo: readonly PropertyChange[] } {
  const result = writeChanges(json(document), base, changes, protectedKeys, operation)
  return { document: asDocument(result.root), undo: result.undo }
}

/** base 处数组项的键（改名之后的新键）。 */
function keyAt(document: ReportDocument, base: JsonPath): string {
  return itemKey(getJsonAt(json(document), base))!
}

function requireDashboard(document: ReportDocument, operation: ReportOperation): void {
  const body: unknown = document.body
  if (!isPlainObject(body) || body.type !== 'dashboard')
    throw new ReportOperationError('not-dashboard', operation)
}

function cardIndex(document: ReportDocument, id: string, operation: ReportOperation): number {
  requireDashboard(document, operation)
  return requireIndex(arrayAt(document, ['body', 'cards']), id, operation)
}

/** 视图类型可以增删换序的列表；不是视图类型时为 undefined。 */
function viewLists(type: unknown): readonly ItemList[] | undefined {
  return typeof type === 'string' && Object.hasOwn(VIEW_LISTS, type) ? VIEW_LISTS[type] : undefined
}

/** 视图的路径：card 缺省时是报表主体（明细表、分组报表、交叉表或扩展视图），否则是卡片带的明细表、分组报表或交叉表。 */
function viewPath(document: ReportDocument, card: string | undefined, operation: ReportOperation): JsonPath {
  if (card === undefined) {
    const body: unknown = document.body
    if (!isPlainObject(body) || typeof body.type !== 'string' || body.type === 'dashboard')
      throw new ReportOperationError('invalid-target', operation)
    return ['body']
  }
  const index = cardIndex(document, card, operation)
  const found = getJsonAt(json(document), ['body', 'cards', index]) as { view?: { type?: unknown } }
  if (!isPlainObject(found.view) || viewLists(found.view.type) === undefined)
    throw new ReportOperationError('invalid-target', operation)
  return ['body', 'cards', index, 'view']
}

/** 列表的路径：视图里的列表，带查询的卡片或扩展视图查询里的 dimensions、measures，直角坐标图的 series。 */
function listPath(document: ReportDocument, card: string | undefined, list: ItemList, operation: ReportOperation): JsonPath {
  let path: JsonPath | undefined
  const base: JsonPath = card === undefined ? ['body'] : ['body', 'cards', cardIndex(document, card, operation)]
  const found = getJsonAt(json(document), base) as { type?: unknown, kind?: unknown, view?: { type?: unknown }, query?: unknown, chart?: { type?: unknown } } | undefined
  const view = card === undefined
    ? viewLists(found?.type) === undefined ? undefined : base
    : isPlainObject(found?.view) && viewLists(found.view.type) !== undefined ? [...base, 'view'] : undefined
  if (view !== undefined) {
    if (viewLists(getJsonAt(json(document), [...view, 'type']))!.includes(list))
      path = [...view, list]
  }
  else if ((list === 'dimensions' || list === 'measures') && isPlainObject(found?.query)) {
    path = [...base, 'query', list]
  }
  else if (list === 'series' && card !== undefined && found?.kind === 'chart' && found.chart?.type === 'cartesian') {
    path = [...base, 'chart', 'series']
  }
  if (path === undefined || arrayAt(document, path) === undefined)
    throw new ReportOperationError('invalid-target', operation)
  return path
}

function setBody(document: ReportDocument, operation: SetBodyOperation): ReportOperationResult {
  if (!isPlainObject(operation.body) || typeof operation.body.type !== 'string')
    throw new ReportOperationError('invalid-value', operation)
  if (jsonEquals(document.body as unknown as JsonValue, operation.body as unknown as JsonValue))
    return unchanged(document)
  const next = run(document, [{ type: 'set', path: ['body'], value: copyValue(operation.body as unknown as JsonValue, operation) }], operation)
  return { document: next, inverse: [{ type: 'setBody', body: document.body }] }
}

function addDataset(document: ReportDocument, operation: AddDatasetOperation): ReportOperationResult {
  const { document: next } = insertItem(document, ['datasets'], operation.dataset, operation.index, operation)
  return { document: next, inverse: [{ type: 'removeDataset', id: operation.dataset.id }] }
}

function datasetIndex(document: ReportDocument, id: string, operation: ReportOperation): number {
  return requireIndex(arrayAt(document, ['datasets']), id, operation)
}

function addField(document: ReportDocument, operation: AddFieldOperation): ReportOperationResult {
  const index = datasetIndex(document, operation.dataset, operation)
  const { document: next } = insertItem(document, ['datasets', index, 'fields'], operation.field, operation.index, operation)
  return { document: next, inverse: [{ type: 'removeField', dataset: operation.dataset, name: operation.field.name }] }
}

function addParameter(document: ReportDocument, operation: AddParameterOperation): ReportOperationResult {
  const { document: next } = insertItem(document, ['parameters'], operation.parameter, operation.index, operation, true)
  return { document: next, inverse: [{ type: 'removeParameter', name: operation.parameter.name }] }
}

function addCard(document: ReportDocument, operation: AddCardOperation): ReportOperationResult {
  requireDashboard(document, operation)
  const { document: next } = insertItem(document, ['body', 'cards'], operation.card, operation.index, operation)
  return { document: next, inverse: [{ type: 'removeCard', id: operation.card.id }] }
}

function isLayout(value: unknown): value is CardLayout {
  return isPlainObject(value) && ['x', 'y', 'w', 'h'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]))
}

function layoutCards(document: ReportDocument, operation: LayoutCardsOperation): ReportOperationResult {
  requireDashboard(document, operation)
  if (!isPlainObject(operation.layouts))
    throw new ReportOperationError('invalid-operation', operation)
  const cards = arrayAt(document, ['body', 'cards'])
  const paths: PathOperation[] = []
  const previous: Record<string, CardLayout> = {}
  for (const [id, layout] of Object.entries(operation.layouts)) {
    const index = requireIndex(cards, id, operation)
    if (!isLayout(layout))
      throw new ReportOperationError('invalid-value', operation)
    const old = (cards![index] as unknown as { layout: CardLayout }).layout
    if (jsonEquals(old as unknown as JsonValue, layout as unknown as JsonValue))
      continue
    previous[id] = old
    paths.push({ type: 'set', path: ['body', 'cards', index, 'layout'], value: { x: layout.x, y: layout.y, w: layout.w, h: layout.h } })
  }
  if (paths.length === 0)
    return unchanged(document)
  return { document: run(document, paths, operation), inverse: [{ type: 'layoutCards', layouts: previous }] }
}

function addLink(document: ReportDocument, operation: AddLinkOperation): ReportOperationResult {
  requireDashboard(document, operation)
  const { document: next } = insertItem(document, ['body', 'links'], operation.link, operation.index, operation, true)
  return { document: next, inverse: [{ type: 'removeLink', id: operation.link.id }] }
}

function addListItem(document: ReportDocument, operation: AddItemOperation): ReportOperationResult {
  const path = listPath(document, operation.card, operation.list, operation)
  const { document: next } = insertItem(document, path, operation.item, operation.index, operation)
  return { document: next, inverse: [{ type: 'removeItem', ...owner(operation.card), list: operation.list, id: itemKey(operation.item)! }] }
}

function owner(card: string | undefined): { card?: string } {
  return card === undefined ? {} : { card }
}

function moveListItem(document: ReportDocument, operation: MoveItemOperation): ReportOperationResult {
  const from = listPath(document, operation.card, operation.list, operation)
  if (operation.to === undefined || operation.to === operation.list) {
    const result = moveItem(document, from, operation.id, operation.index, operation)
    if (result.document === document)
      return unchanged(document)
    return { document: result.document, inverse: [{ type: 'moveItem', ...owner(operation.card), list: operation.list, id: operation.id, index: result.from }] }
  }
  const view = from.slice(0, -1)
  if (getJsonAt(json(document), [...view, 'type']) !== 'crosstab' || !PIVOT_LISTS.includes(operation.list) || !PIVOT_LISTS.includes(operation.to))
    throw new ReportOperationError('invalid-target', operation)
  const to = listPath(document, operation.card, operation.to, operation)
  const source = arrayAt(document, from)
  const index = requireIndex(source, operation.id, operation)
  const item = source![index]!
  const target = arrayAt(document, to)!
  checkUniqueKey(target, item, -1, operation)
  const at = insertIndex(operation.index, target.length, operation)
  const next = run(document, [{ type: 'remove', path: [...from, index] }, { type: 'insert', path: to, index: at, value: item }], operation)
  return { document: next, inverse: [{ type: 'moveItem', ...owner(operation.card), list: operation.to, id: operation.id, index, to: operation.list }] }
}

/**
 * 以纯函数方式执行编辑操作：不修改传入的文档，返回新文档与逆操作数组；没有改到的部分沿用原引用。
 * 操作没有带来变化时返回传入的文档本身与空数组；操作无法执行时抛出 ReportOperationError，传入的文档保持不变。
 * 操作只保证结构与键，引用完整性（字段、维度、卡片的引用）由 validateDocument 检查。
 */
export function applyOperation(document: ReportDocument, operation: ReportOperation): ReportOperationResult {
  if (!isPlainObject(operation) || typeof operation.type !== 'string')
    throw new ReportOperationError('invalid-operation', operation)
  switch (operation.type) {
    case 'updateDocument': {
      const { document: next, undo } = update(document, [], operation.changes, DOCUMENT_PROTECTED, operation)
      return undo.length === 0 ? unchanged(document) : { document: next, inverse: [{ type: 'updateDocument', changes: undo }] }
    }
    case 'setBody':
      return setBody(document, operation)
    case 'addDataset':
      return addDataset(document, operation)
    case 'removeDataset': {
      const { document: next, item, index } = removeItem(document, ['datasets'], operation.id, operation)
      return { document: next, inverse: [{ type: 'addDataset', dataset: item as never, index }] }
    }
    case 'moveDataset': {
      const { document: next, from } = moveItem(document, ['datasets'], operation.id, operation.index, operation)
      return next === document ? unchanged(document) : { document: next, inverse: [{ type: 'moveDataset', id: operation.id, index: from }] }
    }
    case 'updateDataset': {
      const index = datasetIndex(document, operation.id, operation)
      const { document: next, undo } = update(document, ['datasets', index], operation.changes, DATASET_PROTECTED, operation)
      return undo.length === 0 ? unchanged(document) : { document: next, inverse: [{ type: 'updateDataset', id: operation.id, changes: undo }] }
    }
    case 'addField':
      return addField(document, operation)
    case 'removeField': {
      const index = datasetIndex(document, operation.dataset, operation)
      const { document: next, item, index: at } = removeItem(document, ['datasets', index, 'fields'], operation.name, operation)
      return { document: next, inverse: [{ type: 'addField', dataset: operation.dataset, field: item as never, index: at }] }
    }
    case 'moveField': {
      const index = datasetIndex(document, operation.dataset, operation)
      const { document: next, from } = moveItem(document, ['datasets', index, 'fields'], operation.name, operation.index, operation)
      return next === document ? unchanged(document) : { document: next, inverse: [{ type: 'moveField', dataset: operation.dataset, name: operation.name, index: from }] }
    }
    case 'updateField': {
      const dataset = datasetIndex(document, operation.dataset, operation)
      const base = ['datasets', dataset, 'fields', requireIndex(arrayAt(document, ['datasets', dataset, 'fields']), operation.name, operation)]
      const { document: next, undo } = update(document, base, operation.changes, NONE, operation)
      return undo.length === 0 ? unchanged(document) : { document: next, inverse: [{ type: 'updateField', dataset: operation.dataset, name: keyAt(next, base), changes: undo }] }
    }
    case 'addParameter':
      return addParameter(document, operation)
    case 'removeParameter': {
      const { document: next, item, index } = removeItem(document, ['parameters'], operation.name, operation, true)
      return { document: next, inverse: [{ type: 'addParameter', parameter: item as never, index }] }
    }
    case 'moveParameter': {
      const { document: next, from } = moveItem(document, ['parameters'], operation.name, operation.index, operation)
      return next === document ? unchanged(document) : { document: next, inverse: [{ type: 'moveParameter', name: operation.name, index: from }] }
    }
    case 'updateParameter': {
      const base = ['parameters', requireIndex(arrayAt(document, ['parameters']), operation.name, operation)]
      const { document: next, undo } = update(document, base, operation.changes, NONE, operation)
      return undo.length === 0 ? unchanged(document) : { document: next, inverse: [{ type: 'updateParameter', name: keyAt(next, base), changes: undo }] }
    }
    case 'updateDashboard': {
      requireDashboard(document, operation)
      const { document: next, undo } = update(document, ['body'], operation.changes, DASHBOARD_PROTECTED, operation)
      return undo.length === 0 ? unchanged(document) : { document: next, inverse: [{ type: 'updateDashboard', changes: undo }] }
    }
    case 'addCard':
      return addCard(document, operation)
    case 'removeCard': {
      requireDashboard(document, operation)
      const { document: next, item, index } = removeItem(document, ['body', 'cards'], operation.id, operation)
      return { document: next, inverse: [{ type: 'addCard', card: item as never, index }] }
    }
    case 'updateCard': {
      const base = ['body', 'cards', cardIndex(document, operation.id, operation)]
      const { document: next, undo } = update(document, base, operation.changes, CARD_PROTECTED, operation)
      return undo.length === 0 ? unchanged(document) : { document: next, inverse: [{ type: 'updateCard', id: operation.id, changes: undo }] }
    }
    case 'layoutCards':
      return layoutCards(document, operation)
    case 'addLink':
      return addLink(document, operation)
    case 'removeLink': {
      requireDashboard(document, operation)
      const { document: next, item, index } = removeItem(document, ['body', 'links'], operation.id, operation, true)
      return { document: next, inverse: [{ type: 'addLink', link: item as never, index }] }
    }
    case 'updateLink': {
      requireDashboard(document, operation)
      const base = ['body', 'links', requireIndex(arrayAt(document, ['body', 'links']), operation.id, operation)]
      const { document: next, undo } = update(document, base, operation.changes, ['id'], operation)
      return undo.length === 0 ? unchanged(document) : { document: next, inverse: [{ type: 'updateLink', id: operation.id, changes: undo }] }
    }
    case 'updateView': {
      const base = viewPath(document, operation.card, operation)
      const { document: next, undo } = update(document, base, operation.changes, VIEW_PROTECTED, operation)
      return undo.length === 0 ? unchanged(document) : { document: next, inverse: [{ type: 'updateView', ...owner(operation.card), changes: undo }] }
    }
    case 'addItem':
      return addListItem(document, operation)
    case 'removeItem': {
      const path = listPath(document, operation.card, operation.list, operation)
      const { document: next, item, index } = removeItem(document, path, operation.id, operation)
      return { document: next, inverse: [{ type: 'addItem', ...owner(operation.card), list: operation.list, item, index }] }
    }
    case 'moveItem':
      return moveListItem(document, operation)
    case 'updateItem': {
      const path = listPath(document, operation.card, operation.list, operation)
      const base = [...path, requireIndex(arrayAt(document, path), operation.id, operation)]
      const { document: next, undo } = update(document, base, operation.changes, NONE, operation)
      return undo.length === 0 ? unchanged(document) : { document: next, inverse: [{ type: 'updateItem', ...owner(operation.card), list: operation.list, id: keyAt(next, base), changes: undo }] }
    }
    default:
      throw new ReportOperationError('invalid-operation', operation)
  }
}

/**
 * 按顺序执行一组编辑操作，整体成功或整体失败（@xihan-ui/designer-kit 的 applyInSequence）；逆操作为各操作逆操作按相反顺序的拼接。
 * 全部操作都没有带来变化时返回传入的文档本身与空数组。
 */
export function applyOperations(document: ReportDocument, operations: readonly ReportOperation[]): ReportOperationResult {
  return applyInSequence(applyOperation, document, operations)
}
