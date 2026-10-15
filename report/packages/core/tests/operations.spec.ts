/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { JsonValue, ReportDocument, ReportOperation } from '../src'
import { describe, expect, it } from 'vitest'
import { applyOperation, applyOperations, readPath, ReportOperationError, validateDocument } from '../src'
import { dashboardDocument } from './documents'

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

const original = deepFreeze(JSON.parse(JSON.stringify(dashboardDocument)) as ReportDocument)

function roundTrip(operation: ReportOperation): ReportDocument {
  const { document, inverse } = applyOperation(original, operation)
  const restored = applyOperations(document, inverse)
  expect(restored.document).toEqual(original)
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

const cards = ['body', 'cards']

/** 数组项在原文档里的下标。 */
function indexOf(path: readonly (string | number)[], key: string): number {
  return (readPath(original, path) as { id?: string, name?: string }[]).findIndex(item => (item.id ?? item.name) === key)
}

const share = indexOf(cards, 'share')

describe('readPath', () => {
  it('按属性名、数组项的键或下标读取', () => {
    expect(readPath(original, ['body', 'cards', 'share', 'chart', 'type'])).toBe('pie')
    expect(readPath(original, ['datasets', 'sales', 'fields', 'amount', 'type'])).toBe('number')
    expect(readPath(original, ['body', 'cards', 0, 'id'])).toBe('trend')
    expect(readPath(original, ['body', 'cards', 'nope'])).toBeUndefined()
    expect(readPath(original, ['body', 'cards', '0'])).toBeUndefined()
  })
})

describe('applyOperation：set', () => {
  it('改已有属性，逆操作写回原值', () => {
    const document = roundTrip({ type: 'set', path: [...cards, 'share', 'chart', 'variant'], value: 'pie' })
    expect(readPath(document, [...cards, 'share', 'chart', 'variant'])).toBe('pie')
  })

  it('新增属性，逆操作按下标删除它', () => {
    const operation: ReportOperation = { type: 'set', path: [...cards, 'share', 'title'], value: '占比' }
    const { document, inverse } = applyOperation(original, operation)
    expect(inverse).toEqual([{ type: 'remove', path: [...cards, share, 'title'] }])
    expect(readPath(document, [...cards, 'share', 'title'])).toBe('占比')
    roundTrip(operation)
  })

  it('没有变化时返回同一个文档与空逆操作', () => {
    const result = applyOperation(original, { type: 'set', path: [...cards, 'share', 'chart', 'variant'], value: 'donut' })
    expect(result.document).toBe(original)
    expect(result.inverse).toEqual([])
    expect(applyOperation(original, { type: 'set', path: [...cards, 'kpi', 'layout'], value: { x: 8, y: 0, w: 4, h: 3 } }).document).toBe(original)
  })

  it('没改到的部分沿用原引用', () => {
    const { document } = applyOperation(original, { type: 'set', path: [...cards, 'share', 'layout', 'w'], value: 3 })
    expect(document.datasets).toBe(original.datasets)
    const before = original.body as { cards: readonly unknown[] }
    const after = document.body as { cards: readonly unknown[] }
    expect(after.cards[0]).toBe(before.cards[0])
    expect(after.cards[2]).not.toBe(before.cards[2])
  })

  it('改数组项的键，逆操作按下标定位', () => {
    const { document, inverse } = applyOperation(original, { type: 'set', path: [...cards, 'share', 'id'], value: 'share2' })
    expect(inverse).toEqual([{ type: 'set', path: [...cards, share, 'id'], value: 'share' }])
    expect(readPath(document, [...cards, 'share2', 'kind'])).toBe('chart')
    roundTrip({ type: 'set', path: ['datasets', 'sales', 'fields', 'qty', 'name'], value: 'quantity' })
  })

  it('整项替换，键变了也能撤销', () => {
    const field: JsonValue = { name: 'cost', type: 'number', title: '成本' }
    const { inverse } = applyOperation(original, { type: 'set', path: ['datasets', 'sales', 'fields', 'qty'], value: field })
    const fields = ['datasets', indexOf(['datasets'], 'sales'), 'fields']
    expect(inverse).toEqual([{ type: 'set', path: [...fields, indexOf(fields, 'qty')], value: { name: 'qty', type: 'number', title: '数量' } }])
    roundTrip({ type: 'set', path: ['datasets', 'sales', 'fields', 'qty'], value: field })
  })

  it('改名撞上已有的键时抛出 duplicate-key', () => {
    expect(errorCode(() => applyOperation(original, { type: 'set', path: [...cards, 'share', 'id'], value: 'kpi' }))).toBe('duplicate-key')
    expect(errorCode(() => applyOperation(original, { type: 'set', path: [...cards, 'share'], value: { id: 'kpi' } }))).toBe('duplicate-key')
  })

  it('不写 value 时删除对象属性，属性不存在时没有变化', () => {
    const { document, inverse } = applyOperation(original, { type: 'set', path: [...cards, 'share', 'chart', 'variant'] })
    expect(readPath(document, [...cards, 'share', 'chart'])).not.toHaveProperty('variant')
    expect(inverse).toEqual([{ type: 'set', path: [...cards, share, 'chart', 'variant'], value: 'donut' }])
    expect(applyOperation(original, { type: 'set', path: [...cards, 'share', 'title'] }).document).toBe(original)
  })

  it('空路径替换整个文档', () => {
    const replacement = { ...original, title: '新标题' } as unknown as JsonValue
    const { document, inverse } = applyOperation(original, { type: 'set', path: [], value: replacement })
    expect(document.title).toBe('新标题')
    expect(applyOperations(document, inverse).document).toBe(original)
    expect(errorCode(() => applyOperation(original, { type: 'set', path: [], value: [] }))).toBe('invalid-value')
  })
})

describe('applyOperation：insert / remove / move', () => {
  it('插入带键的项，逆操作按下标删除', () => {
    const operation: ReportOperation = {
      type: 'insert',
      path: [...cards, 'share', 'query', 'measures'],
      index: 0,
      value: { id: 'n', aggregate: 'count' },
    }
    const { document, inverse } = applyOperation(original, operation)
    expect(inverse).toEqual([{ type: 'remove', path: [...cards, share, 'query', 'measures', 0] }])
    expect(readPath(document, [...cards, 'share', 'query', 'measures', 0, 'id'])).toBe('n')
    roundTrip(operation)
  })

  it('插入不带键的项，逆操作按下标删除；缺省插到末尾', () => {
    const operation: ReportOperation = { type: 'insert', path: [...cards, 'detail', 'view', 'sort'], value: { field: 'amount' } }
    const { inverse } = applyOperation(original, operation)
    expect(inverse).toEqual([{ type: 'remove', path: [...cards, indexOf(cards, 'detail'), 'view', 'sort', 1] }])
    roundTrip(operation)
  })

  it('插入重复的键、越界或不是数组时抛出', () => {
    const measures = [...cards, 'share', 'query', 'measures']
    expect(errorCode(() => applyOperation(original, { type: 'insert', path: measures, value: { id: 'amount', aggregate: 'count' } }))).toBe('duplicate-key')
    expect(errorCode(() => applyOperation(original, { type: 'insert', path: measures, index: 5, value: { id: 'x', aggregate: 'count' } }))).toBe('index-out-of-range')
    expect(errorCode(() => applyOperation(original, { type: 'insert', path: [...cards, 'share', 'query'], value: 1 }))).toBe('not-an-array')
  })

  it('删除数组项与对象属性，逆操作放回原位', () => {
    const { document, inverse } = applyOperation(original, { type: 'remove', path: [...cards, 'funnel'] })
    expect(inverse).toEqual([{ type: 'insert', path: cards, index: 3, value: readPath(original, [...cards, 'funnel']) as JsonValue }])
    expect(readPath(document, [...cards, 'funnel'])).toBeUndefined()
    roundTrip({ type: 'remove', path: [...cards, 'funnel'] })
    roundTrip({ type: 'remove', path: [...cards, 'detail', 'view', 'sort', 0] })
    roundTrip({ type: 'remove', path: ['body', 'links'] })
  })

  it('删除不存在的路径或空路径时抛出', () => {
    expect(errorCode(() => applyOperation(original, { type: 'remove', path: [...cards, 'ghost'] }))).toBe('path-not-found')
    expect(errorCode(() => applyOperation(original, { type: 'remove', path: ['body', 'nothing'] }))).toBe('path-not-found')
    expect(errorCode(() => applyOperation(original, { type: 'remove', path: [] }))).toBe('invalid-path')
  })

  it('移动数组项，逆操作移回；原位不动时没有变化', () => {
    const { document, inverse } = applyOperation(original, { type: 'move', path: [...cards, 'pivot'], index: 0 })
    expect((readPath(document, cards) as { id: string }[]).map(card => card.id).slice(0, 2)).toEqual(['pivot', 'trend'])
    expect(inverse).toEqual([{ type: 'move', path: [...cards, 0], index: indexOf(cards, 'pivot') }])
    roundTrip({ type: 'move', path: [...cards, 'pivot'], index: 0 })
    roundTrip({ type: 'move', path: [...cards, 0], index: 4 })
    expect(applyOperation(original, { type: 'move', path: [...cards, 'trend'], index: 0 }).document).toBe(original)
    expect(errorCode(() => applyOperation(original, { type: 'move', path: [...cards, 'trend'], index: 10 }))).toBe('index-out-of-range')
    expect(errorCode(() => applyOperation(original, { type: 'move', path: ['body', 'grid', 'columns'], index: 0 }))).toBe('not-an-array')
  })
})

describe('applyOperation：模板即数据', () => {
  it('值必须是纯 JSON', () => {
    const path = [...cards, 'share', 'title']
    for (const value of [() => 1, Number.NaN, Number.POSITIVE_INFINITY, new Date(0), { nested: [1, undefined] }, new Map()])
      expect(errorCode(() => applyOperation(original, { type: 'set', path, value: value as unknown as JsonValue }))).toBe('invalid-value')
  })

  it('路径段只能是字符串或非负整数，不能是原型键', () => {
    expect(errorCode(() => applyOperation(original, { type: 'remove', path: ['body', 1.5] }))).toBe('invalid-path')
    expect(errorCode(() => applyOperation(original, { type: 'set', path: ['__proto__', 'x'], value: 1 }))).toBe('invalid-path')
    expect(errorCode(() => applyOperation(original, { type: 'remove', path: 'body' } as unknown as ReportOperation))).toBe('invalid-operation')
    expect(errorCode(() => applyOperation(original, { type: 'unknown', path: [] } as unknown as ReportOperation))).toBe('invalid-operation')
  })
})

describe('applyOperations', () => {
  it('批量操作的逆操作按反序拼接，应用后还原', () => {
    const operations: ReportOperation[] = [
      { type: 'set', path: [...cards, 'share', 'id'], value: 'mix' },
      { type: 'set', path: ['body', 'links', 'byRegion', 'targets', 0, 'card'], value: 'mix' },
      { type: 'insert', path: [...cards, 'mix', 'query', 'measures'], value: { id: 'n', aggregate: 'count' } },
      { type: 'move', path: [...cards, 'mix'], index: 0 },
      { type: 'remove', path: [...cards, 'funnel'] },
    ]
    const { document, inverse } = applyOperations(original, operations)
    expect(validateDocument(document)).toEqual([])
    expect(inverse.map(operation => operation.type)).toEqual(['insert', 'move', 'remove', 'set', 'set'])
    expect(applyOperations(document, inverse).document).toEqual(original)
  })

  it('全部没有变化时返回同一个文档', () => {
    const result = applyOperations(original, [
      { type: 'set', path: ['title'], value: '销售看板' },
      { type: 'move', path: [...cards, 'trend'], index: 0 },
    ])
    expect(result.document).toBe(original)
    expect(result.inverse).toEqual([])
  })

  it('中途失败时抛出，输入文档不变', () => {
    expect(errorCode(() => applyOperations(original, [
      { type: 'set', path: ['title'], value: '改了' },
      { type: 'remove', path: [...cards, 'ghost'] },
    ]))).toBe('path-not-found')
    expect(original.title).toBe('销售看板')
  })
})
