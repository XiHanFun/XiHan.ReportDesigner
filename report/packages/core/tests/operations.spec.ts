/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardCard, DashboardView, JsonValue, ReportDocument, ReportOperation } from '../src'
import { describe, expect, it } from 'vitest'
import { applyOperation, applyOperations, readPath, ReportOperationError, validateDocument } from '../src'
import { dashboardDocument, groupDocument } from './documents'

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

const original = deepFreeze(JSON.parse(JSON.stringify(dashboardDocument)) as ReportDocument)
const grouped = deepFreeze(JSON.parse(JSON.stringify(groupDocument)) as ReportDocument)

/** 应用操作，再应用逆操作必须还原出原文档；返回应用后的文档。 */
function roundTrip(operation: ReportOperation, from: ReportDocument = original): ReportDocument {
  const { document, inverse } = applyOperation(from, operation)
  expect(document).not.toBe(from)
  expect(applyOperations(document, inverse).document).toEqual(from)
  return document
}

function errorCode(run: () => unknown): string | undefined {
  try {
    run()
  }
  catch (error) {
    return error instanceof ReportOperationError ? error.code : 'other'
  }
  return undefined
}

function fail(operation: ReportOperation, from: ReportDocument = original): string | undefined {
  return errorCode(() => applyOperation(from, operation))
}

function cardIds(document: ReportDocument): string[] {
  return (document.body as DashboardView).cards.map(card => card.id)
}

describe('readPath', () => {
  it('按属性名、数组项的键或下标读取', () => {
    expect(readPath(original, ['body', 'cards', 'share', 'chart', 'type'])).toBe('pie')
    expect(readPath(original, ['datasets', 'sales', 'fields', 'amount', 'type'])).toBe('number')
    expect(readPath(original, ['body', 'cards', 0, 'id'])).toBe('trend')
    expect(readPath(original, ['body', 'cards', 'nope'])).toBeUndefined()
    expect(readPath(original, ['body', 'cards', '0'])).toBeUndefined()
  })
})

describe('文档与报表主体', () => {
  it('updateDocument 改文档属性，不能改 datasets、parameters、body 与 schemaVersion', () => {
    const document = roundTrip({ type: 'updateDocument', changes: [{ path: ['title'], value: '新标题' }, { path: ['description'], value: '说明' }] })
    expect(document.title).toBe('新标题')
    expect(document.datasets).toBe(original.datasets)
    for (const key of ['datasets', 'parameters', 'body', 'schemaVersion'])
      expect(fail({ type: 'updateDocument', changes: [{ path: [key], value: [] }] })).toBe('protected-path')
    expect(fail({ type: 'updateDocument', changes: [{ path: [] }] })).toBe('invalid-path')
  })

  it('没有变化时返回同一个文档与空逆操作', () => {
    const result = applyOperation(original, { type: 'updateDocument', changes: [{ path: ['title'], value: original.title! }] })
    expect(result.document).toBe(original)
    expect(result.inverse).toEqual([])
  })

  it('setBody 换掉报表主体，逆操作换回原主体', () => {
    const document = roundTrip({ type: 'setBody', body: grouped.body })
    expect(document.body.type).toBe('group')
    expect(applyOperation(original, { type: 'setBody', body: original.body }).document).toBe(original)
    expect(fail({ type: 'setBody', body: [] as unknown as ReportDocument['body'] })).toBe('invalid-value')
  })
})

describe('数据集与字段', () => {
  const extra = { id: 'stock', fields: [{ name: 'sku', type: 'string' }] } as const

  it('增删换序数据集，逆操作放回原位', () => {
    const added = roundTrip({ type: 'addDataset', dataset: extra, index: 0 })
    expect(added.datasets.map(dataset => dataset.id)).toEqual(['stock', 'sales'])
    roundTrip({ type: 'moveDataset', id: 'stock', index: 1 }, added)
    roundTrip({ type: 'removeDataset', id: 'sales' })
    expect(applyOperation(original, { type: 'moveDataset', id: 'sales', index: 0 }).document).toBe(original)
  })

  it('updateDataset 不能改 id 与 fields', () => {
    const document = roundTrip({ type: 'updateDataset', id: 'sales', changes: [{ path: ['title'], value: '订单' }] })
    expect(document.datasets[0]!.title).toBe('订单')
    expect(fail({ type: 'updateDataset', id: 'sales', changes: [{ path: ['id'], value: 'x' }] })).toBe('protected-path')
    expect(fail({ type: 'updateDataset', id: 'sales', changes: [{ path: ['fields'], value: [] }] })).toBe('protected-path')
    expect(fail({ type: 'updateDataset', id: 'ghost', changes: [] })).toBe('not-found')
  })

  it('增删换序字段；改名后逆操作按新名字定位', () => {
    roundTrip({ type: 'addField', dataset: 'sales', field: { name: 'cost', type: 'number' }, index: 1 })
    roundTrip({ type: 'removeField', dataset: 'sales', name: 'qty' })
    roundTrip({ type: 'moveField', dataset: 'sales', name: 'qty', index: 0 })
    const { document, inverse } = applyOperation(original, { type: 'updateField', dataset: 'sales', name: 'qty', changes: [{ path: ['name'], value: 'quantity' }, { path: ['title'], value: '件数' }] })
    expect(readPath(document, ['datasets', 'sales', 'fields', 'quantity', 'title'])).toBe('件数')
    expect(inverse).toEqual([expect.objectContaining({ type: 'updateField', dataset: 'sales', name: 'quantity' })])
    expect(applyOperations(document, inverse).document).toEqual(original)
  })

  it('字段重名、找不到或越界时抛出', () => {
    expect(fail({ type: 'addField', dataset: 'sales', field: { name: 'qty', type: 'number' } })).toBe('duplicate-key')
    expect(fail({ type: 'updateField', dataset: 'sales', name: 'qty', changes: [{ path: ['name'], value: 'amount' }] })).toBe('duplicate-key')
    expect(fail({ type: 'removeField', dataset: 'sales', name: 'ghost' })).toBe('not-found')
    expect(fail({ type: 'addField', dataset: 'ghost', field: { name: 'x', type: 'number' } })).toBe('not-found')
    expect(fail({ type: 'moveField', dataset: 'sales', name: 'qty', index: 99 })).toBe('index-out-of-range')
    expect(fail({ type: 'addField', dataset: 'sales', field: { name: '', type: 'number' } })).toBe('invalid-value')
  })
})

describe('报表参数', () => {
  it('增删换序与改名；改名后逆操作按新名字定位', () => {
    roundTrip({ type: 'addParameter', parameter: { name: 'to', type: 'date' }, index: 0 })
    roundTrip({ type: 'removeParameter', name: 'regions' })
    roundTrip({ type: 'moveParameter', name: 'from', index: 0 })
    const { document, inverse } = applyOperation(original, { type: 'updateParameter', name: 'from', changes: [{ path: ['name'], value: 'since' }] })
    expect(inverse).toEqual([expect.objectContaining({ type: 'updateParameter', name: 'since' })])
    expect(applyOperations(document, inverse).document).toEqual(original)
    expect(fail({ type: 'updateParameter', name: 'from', changes: [{ path: ['name'], value: 'year' }] })).toBe('duplicate-key')
  })

  it('没有 parameters 时新增会补出数组，删到一个不剩时去掉这个属性', () => {
    const { parameters: _parameters, ...rest } = original
    const bare = deepFreeze(JSON.parse(JSON.stringify(rest)) as ReportDocument)
    const { document } = applyOperation(bare, { type: 'addParameter', parameter: { name: 'p', type: 'number' } })
    expect(document.parameters).toEqual([{ name: 'p', type: 'number' }])
    roundTrip({ type: 'addParameter', parameter: { name: 'p', type: 'number' } }, bare)
    const removed = applyOperation(document, { type: 'removeParameter', name: 'p' }).document
    expect(removed).not.toHaveProperty('parameters')
  })
})

describe('看板与卡片', () => {
  const card: DashboardCard = {
    id: 'extra',
    kind: 'metric',
    layout: { x: 0, y: 20, w: 3, h: 2 },
    dataset: 'sales',
    query: { dimensions: [], measures: [{ id: 'n', aggregate: 'count' }] },
    metric: { value: 'n' },
  }

  it('增删卡片，逆操作放回原位；没改到的卡片沿用原引用', () => {
    const added = roundTrip({ type: 'addCard', card, index: 1 })
    expect(cardIds(added).slice(0, 2)).toEqual(['trend', 'extra'])
    expect((added.body as DashboardView).cards[0]).toBe((original.body as DashboardView).cards[0])
    roundTrip({ type: 'removeCard', id: 'funnel' })
    expect(fail({ type: 'addCard', card: { ...card, id: 'kpi' } })).toBe('duplicate-key')
    expect(fail({ type: 'removeCard', id: 'ghost' })).toBe('not-found')
  })

  it('updateCard 不能改 id、kind 与 layout', () => {
    const document = roundTrip({ type: 'updateCard', id: 'share', changes: [{ path: ['title'], value: '占比' }, { path: ['chart', 'variant'], value: 'pie' }] })
    expect(readPath(document, ['body', 'cards', 'share', 'chart', 'variant'])).toBe('pie')
    for (const key of ['id', 'kind', 'layout'])
      expect(fail({ type: 'updateCard', id: 'share', changes: [{ path: [key], value: 'x' }] })).toBe('protected-path')
  })

  it('layoutCards 只改位置大小变了的卡片，逆操作写回原位置', () => {
    const { document, inverse } = applyOperation(original, { type: 'layoutCards', layouts: { share: { x: 0, y: 0, w: 12, h: 4 }, kpi: readPath(original, ['body', 'cards', 'kpi', 'layout']) as never } })
    expect(readPath(document, ['body', 'cards', 'share', 'layout'])).toEqual({ x: 0, y: 0, w: 12, h: 4 })
    expect(inverse).toEqual([{ type: 'layoutCards', layouts: { share: readPath(original, ['body', 'cards', 'share', 'layout']) } }])
    expect(applyOperations(document, inverse).document).toEqual(original)
    expect(applyOperation(original, { type: 'layoutCards', layouts: {} }).document).toBe(original)
    expect(fail({ type: 'layoutCards', layouts: { share: { x: 0, y: 0, w: Number.NaN, h: 1 } } })).toBe('invalid-value')
    expect(fail({ type: 'layoutCards', layouts: { ghost: { x: 0, y: 0, w: 1, h: 1 } } })).toBe('not-found')
  })

  it('updateDashboard 改网格，不能改 type、cards 与 links', () => {
    roundTrip({ type: 'updateDashboard', changes: [{ path: ['grid', 'rowHeight'], value: 40 }] })
    expect(fail({ type: 'updateDashboard', changes: [{ path: ['cards'], value: [] }] })).toBe('protected-path')
  })

  it('增删改联动；删到一个不剩时去掉 links', () => {
    roundTrip({ type: 'addLink', link: { id: 'byProduct', card: 'share', dimension: 'product', targets: [{ card: 'detail', field: 'product' }] } })
    roundTrip({ type: 'updateLink', id: 'byRegion', changes: [{ path: ['targets', 0, 'field'], value: 'product' }] })
    const once = applyOperation(original, { type: 'removeLink', id: 'byMonth' }).document
    const twice = roundTrip({ type: 'removeLink', id: 'byRegion' }, once)
    expect(twice.body).not.toHaveProperty('links')
    expect(fail({ type: 'updateLink', id: 'byRegion', changes: [{ path: ['id'], value: 'x' }] })).toBe('protected-path')
  })

  it('报表主体不是看板时，看板操作抛 not-dashboard', () => {
    expect(fail({ type: 'addCard', card }, grouped)).toBe('not-dashboard')
    expect(fail({ type: 'layoutCards', layouts: {} }, grouped)).toBe('not-dashboard')
    expect(fail({ type: 'removeLink', id: 'x' }, grouped)).toBe('not-dashboard')
  })
})

describe('视图与列表项', () => {
  it('updateView 改报表主体或表格卡片的视图，不能改 type', () => {
    roundTrip({ type: 'updateView', changes: [{ path: ['detail'], value: false }] }, grouped)
    const document = roundTrip({ type: 'updateView', card: 'detail', changes: [{ path: ['limit'], value: 10 }, { path: ['columns', 'amount', 'title'], value: '金额' }] })
    expect(readPath(document, ['body', 'cards', 'detail', 'view', 'columns', 'amount', 'title'])).toBe('金额')
    expect(fail({ type: 'updateView', card: 'detail', changes: [{ path: ['type'], value: 'group' }] })).toBe('protected-path')
    expect(fail({ type: 'updateView', changes: [] })).toBe('invalid-target')
    expect(fail({ type: 'updateView', card: 'share', changes: [] })).toBe('invalid-target')
  })

  it('增删换序改视图的列表项', () => {
    roundTrip({ type: 'addItem', card: 'detail', list: 'columns', item: { id: 'product', field: 'product' }, index: 0 })
    roundTrip({ type: 'removeItem', card: 'detail', list: 'columns', id: 'qty' })
    roundTrip({ type: 'moveItem', card: 'detail', list: 'columns', id: 'unit', index: 0 })
    const { document, inverse } = applyOperation(original, { type: 'updateItem', card: 'detail', list: 'columns', id: 'qty', changes: [{ path: ['id'], value: 'quantity' }] })
    expect(inverse).toEqual([expect.objectContaining({ type: 'updateItem', card: 'detail', list: 'columns', id: 'quantity' })])
    expect(applyOperations(document, inverse).document).toEqual(original)
    roundTrip({ type: 'addItem', list: 'groups', item: { id: 'product', field: 'product' } }, grouped)
  })

  it('图表与指标卡片的查询列表与直角坐标图的系列', () => {
    roundTrip({ type: 'addItem', card: 'share', list: 'measures', item: { id: 'n', aggregate: 'count' } })
    roundTrip({ type: 'removeItem', card: 'kpi', list: 'dimensions', id: 'day' })
    roundTrip({ type: 'moveItem', card: 'trend', list: 'series', id: 'line', index: 0 })
    expect(fail({ type: 'addItem', card: 'share', list: 'series', item: { id: 's' } })).toBe('invalid-target')
    expect(fail({ type: 'addItem', card: 'detail', list: 'rows', item: { id: 's' } })).toBe('invalid-target')
  })

  it('交叉表的行维度与列维度之间移动（透视），逆操作移回', () => {
    const { document, inverse } = applyOperation(original, { type: 'moveItem', card: 'pivot', list: 'rows', id: 'region', index: 0, to: 'columns' })
    expect(readPath(document, ['body', 'cards', 'pivot', 'view', 'rows'])).toEqual([])
    expect((readPath(document, ['body', 'cards', 'pivot', 'view', 'columns']) as { id: string }[]).map(item => item.id)).toEqual(['region', 'quarter'])
    expect(inverse).toEqual([{ type: 'moveItem', card: 'pivot', list: 'columns', id: 'region', index: 0, to: 'rows' }])
    expect(applyOperations(document, inverse).document).toEqual(original)
    expect(fail({ type: 'moveItem', card: 'pivot', list: 'rows', id: 'region', index: 0, to: 'measures' })).toBe('invalid-target')
    expect(fail({ type: 'moveItem', card: 'detail', list: 'columns', id: 'qty', index: 0, to: 'rows' })).toBe('invalid-target')
  })

  it('列表项重复、找不到或越界时抛出', () => {
    expect(fail({ type: 'addItem', card: 'detail', list: 'columns', item: { id: 'qty', field: 'qty' } })).toBe('duplicate-key')
    expect(fail({ type: 'updateItem', card: 'detail', list: 'columns', id: 'qty', changes: [{ path: ['id'], value: 'amount' }] })).toBe('duplicate-key')
    expect(fail({ type: 'removeItem', card: 'detail', list: 'columns', id: 'ghost' })).toBe('not-found')
    expect(fail({ type: 'moveItem', card: 'detail', list: 'columns', id: 'qty', index: 10 })).toBe('index-out-of-range')
    expect(fail({ type: 'addItem', card: 'detail', list: 'columns', item: { field: 'qty' } })).toBe('invalid-value')
  })
})

describe('模板即数据', () => {
  it('写入的值必须是纯 JSON，写入后与调用方的对象互不影响', () => {
    for (const value of [() => 1, Number.NaN, Number.POSITIVE_INFINITY, new Date(0), { nested: [1, undefined] }, new Map()])
      expect(fail({ type: 'updateCard', id: 'share', changes: [{ path: ['title'], value: value as unknown as JsonValue }] })).toBe('invalid-value')
    const column = { id: 'product', field: 'product' }
    const { document } = applyOperation(original, { type: 'addItem', card: 'detail', list: 'columns', item: column })
    column.field = 'changed'
    expect(readPath(document, ['body', 'cards', 'detail', 'view', 'columns', 'product', 'field'])).toBe('product')
  })

  it('路径段只能是字符串或非负整数，不能是原型键；未知操作抛 invalid-operation', () => {
    expect(fail({ type: 'updateCard', id: 'share', changes: [{ path: ['chart', 1.5], value: 1 }] })).toBe('invalid-path')
    expect(fail({ type: 'updateDocument', changes: [{ path: ['__proto__', 'x'], value: 1 }] })).toBe('invalid-path')
    expect(fail({ type: 'updateCard', id: 'trend', changes: [{ path: ['chart', 'series', 'ghost', 'x'], value: 1 }] })).toBe('path-not-found')
    expect(fail({ type: 'unknown' } as unknown as ReportOperation)).toBe('invalid-operation')
    expect(fail({ type: 'updateDocument', changes: 'x' } as unknown as ReportOperation)).toBe('invalid-operation')
  })
})

describe('applyOperations', () => {
  it('一组操作的逆操作按反序拼接，应用后还原；中途失败时整体不生效', () => {
    const operations: ReportOperation[] = [
      { type: 'updateItem', card: 'pivot', list: 'rows', id: 'region', changes: [{ path: ['id'], value: 'area' }] },
      { type: 'updateLink', id: 'byRegion', changes: [{ path: ['dimension'], value: 'area' }] },
      { type: 'addItem', card: 'share', list: 'measures', item: { id: 'n', aggregate: 'count' } },
      { type: 'removeCard', id: 'funnel' },
      { type: 'layoutCards', layouts: { share: { x: 0, y: 20, w: 4, h: 3 } } },
    ]
    const { document, inverse } = applyOperations(original, operations)
    expect(validateDocument(document)).toEqual([])
    expect(applyOperations(document, inverse).document).toEqual(original)
    expect(errorCode(() => applyOperations(original, [...operations, { type: 'removeCard', id: 'ghost' }]))).toBe('not-found')
    expect(applyOperations(original, []).document).toBe(original)
  })
})
