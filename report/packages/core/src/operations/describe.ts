/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 撤销栈里一步的说明素材：按这一步的正向操作与应用前的文档，给出动作、对象种类、对象名与个数，文案由设计器按语言拼成句子。

import type { ReportDocument } from '../schema/document'
import type { ItemList, ReportOperation } from './types'
import { getJsonAt, isPlainObject } from '@xihan-ui/core/json'
import { listPath } from './apply'

/** 一步里的动作。 */
export type ReportStepAction = 'add' | 'remove' | 'move' | 'update' | 'rename' | 'layout' | 'replace'

/** 一步改的对象种类，与设计器文案 objectKinds 的键同一组。 */
export type ReportStepKind
  = | 'document'
    | 'dashboard'
    | 'card'
    | 'view'
    | 'dataset'
    | 'field'
    | 'parameter'
    | 'link'
    | 'dimension'
    | 'measure'
    | 'column'
    | 'group'
    | 'series'

/** 一步的说明素材。 */
export interface ReportStep {
  readonly action: ReportStepAction
  readonly kind: ReportStepKind
  /** 对象名：标题，没有标题时取 id 或字段名；只改一个对象时才有。 */
  readonly name?: string
  /** 这一步里同种对象改了几个。 */
  readonly count: number
}

const ITEM_KINDS: Readonly<Record<ItemList, ReportStepKind>> = {
  dimensions: 'dimension',
  rows: 'dimension',
  columns: 'column',
  measures: 'measure',
  groups: 'group',
  series: 'series',
}

/** 对象的显示名：title，没有时取 fallback。 */
function nameOf(value: unknown, fallback: string | undefined): string | undefined {
  const title = isPlainObject(value) && typeof value.title === 'string' && value.title !== '' ? value.title : undefined
  return title ?? fallback
}

function keyed(list: unknown, key: 'id' | 'name', id: string): unknown {
  return Array.isArray(list) ? list.find(item => isPlainObject(item) && item[key] === id) : undefined
}

function cardName(document: ReportDocument, id: string): string {
  return nameOf(document.body.type === 'dashboard' ? keyed(document.body.cards, 'id', id) : undefined, id) ?? id
}

function datasetOf(document: ReportDocument, id: string): unknown {
  return keyed(document.datasets, 'id', id)
}

/** 列表项的名字：title，其次字段名，再次 id；找不到列表时取 id。 */
function itemName(document: ReportDocument, card: string | undefined, list: ItemList, id: string): string {
  let item: unknown
  try {
    item = keyed(getJsonAt(document as never, listPath(document, card, list, { type: 'removeItem', list, id, ...(card === undefined ? {} : { card }) })), 'id', id)
  }
  catch {
    item = undefined
  }
  const field = isPlainObject(item) && typeof item.field === 'string' ? item.field : undefined
  return nameOf(item, field ?? id) ?? id
}

/** 一个操作对应的说明素材，name 与 count 待合并。 */
function stepOf(operation: ReportOperation, before: ReportDocument): Omit<ReportStep, 'count'> {
  switch (operation.type) {
    case 'updateDocument':
      return { action: 'update', kind: 'document', ...(before.title ? { name: before.title } : {}) }
    case 'setBody':
      return { action: 'replace', kind: 'view' }
    case 'addDataset':
      return { action: 'add', kind: 'dataset', name: nameOf(operation.dataset, operation.dataset.id)! }
    case 'removeDataset':
    case 'moveDataset':
    case 'updateDataset':
      return { action: operation.type === 'removeDataset' ? 'remove' : operation.type === 'moveDataset' ? 'move' : 'update', kind: 'dataset', name: nameOf(datasetOf(before, operation.id), operation.id)! }
    case 'addField':
      return { action: 'add', kind: 'field', name: nameOf(operation.field, operation.field.name)! }
    case 'removeField':
    case 'moveField':
    case 'updateField': {
      const dataset = datasetOf(before, operation.dataset)
      const field = isPlainObject(dataset) ? keyed(dataset.fields, 'name', operation.name) : undefined
      return { action: operation.type === 'removeField' ? 'remove' : operation.type === 'moveField' ? 'move' : 'update', kind: 'field', name: nameOf(field, operation.name)! }
    }
    case 'addParameter':
      return { action: 'add', kind: 'parameter', name: nameOf(operation.parameter, operation.parameter.name)! }
    case 'removeParameter':
    case 'moveParameter':
    case 'updateParameter':
      return { action: operation.type === 'removeParameter' ? 'remove' : operation.type === 'moveParameter' ? 'move' : 'update', kind: 'parameter', name: nameOf(keyed(before.parameters, 'name', operation.name), operation.name)! }
    case 'updateDashboard':
      return { action: 'update', kind: 'dashboard' }
    case 'addCard':
      return { action: 'add', kind: 'card', name: nameOf(operation.card, operation.card.id)! }
    case 'removeCard':
    case 'updateCard':
      return { action: operation.type === 'removeCard' ? 'remove' : 'update', kind: 'card', name: cardName(before, operation.id) }
    case 'layoutCards': {
      const ids = Object.keys(operation.layouts)
      return { action: 'layout', kind: 'card', ...(ids.length === 1 ? { name: cardName(before, ids[0]!) } : {}) }
    }
    case 'addLink':
    case 'removeLink':
    case 'updateLink':
      return { action: operation.type === 'addLink' ? 'add' : operation.type === 'removeLink' ? 'remove' : 'update', kind: 'link' }
    case 'updateView':
      return { action: 'update', kind: 'view', ...(operation.card === undefined ? {} : { name: cardName(before, operation.card) }) }
    case 'addItem': {
      const field = isPlainObject(operation.item) && typeof operation.item.field === 'string' ? operation.item.field : undefined
      const id = isPlainObject(operation.item) && typeof operation.item.id === 'string' ? operation.item.id : undefined
      const name = nameOf(operation.item, field ?? id)
      return { action: 'add', kind: ITEM_KINDS[operation.list], ...(name === undefined ? {} : { name }) }
    }
    case 'removeItem':
    case 'moveItem':
    case 'updateItem':
      return { action: operation.type === 'removeItem' ? 'remove' : operation.type === 'moveItem' ? 'move' : 'update', kind: ITEM_KINDS[operation.list], name: itemName(before, operation.card, operation.list, operation.id) }
  }
}

/**
 * 撤销栈里一步的说明素材：按第一个操作定动作与对象种类，同一步里同动作、同种类的操作合起来计个数；
 * 只改了一个对象时带上它的名字（标题，没有时取 id 或字段名）。没有操作时为 undefined。
 */
export function describeReportStep(operations: readonly ReportOperation[], before: ReportDocument): ReportStep | undefined {
  const first = operations[0]
  if (first === undefined)
    return undefined
  const primary = stepOf(first, before)
  const same = operations.filter((operation) => {
    const step = stepOf(operation, before)
    return step.action === primary.action && step.kind === primary.kind
  })
  const names = new Set(same.map(operation => stepOf(operation, before).name))
  const count = first.type === 'layoutCards' ? Object.keys(first.layouts).length : names.size
  return count > 1 ? { action: primary.action, kind: primary.kind, count } : { ...primary, count: 1 }
}
