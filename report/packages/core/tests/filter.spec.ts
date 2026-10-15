/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { ComputeOptions, DataRow, DatasetSchema, FilterCondition, FilterGroup, FilterOperator, Operand } from '../src'
import { describe, expect, it } from 'vitest'
import { compileFilter, ReportComputeError } from '../src'
import { createEnvironment } from '../src/engine/context'

const dataset: DatasetSchema = {
  id: 'people',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'age', type: 'number' },
    { name: 'joined', type: 'date' },
    { name: 'seen', type: 'datetime' },
    { name: 'active', type: 'boolean' },
  ],
}

const rows: readonly DataRow[] = [
  { name: 'Ann', age: 30, joined: '2026-01-10', seen: '2026-10-16T09:00:00', active: true },
  { name: 'bob', age: 25, joined: new Date(Date.UTC(2026, 2, 5)), seen: Date.UTC(2026, 9, 15, 20), active: false },
  { name: 'Cid', age: null, joined: null, seen: null, active: null },
  { name: '', age: 40, joined: '2025-12-31', seen: '2026-10-16T01:00:00+08:00', active: true },
  { name: 'Dee', age: '35', joined: '2026-03', seen: '2026-10-16', active: false },
]

function names(filter: FilterGroup | undefined, options: ComputeOptions = {}, extra: readonly FilterCondition[] = []): unknown[] {
  const predicate = compileFilter(filter, extra, createEnvironment(dataset, options))
  return rows.filter(row => predicate(row)).map(row => row.name)
}

function where(field: string, operator: FilterOperator, value?: Operand, more: Partial<FilterCondition> = {}): FilterGroup {
  return { logic: 'and', conditions: [{ id: 'c', field, operator, value, ...more }] }
}

describe('compileFilter：缺失值语义', () => {
  it('isEmpty 只匹配缺失值，isNotEmpty 相反；空字符串不算缺失', () => {
    expect(names(where('age', 'isEmpty'))).toEqual(['Cid'])
    expect(names(where('name', 'isEmpty'))).toEqual([])
    expect(names(where('age', 'isNotEmpty'))).toEqual(['Ann', 'bob', '', 'Dee'])
  })

  it('正向运算符不匹配缺失值', () => {
    expect(names(where('age', 'gte', 0))).toEqual(['Ann', 'bob', ''])
    expect(names(where('age', 'in', [30, 25]))).toEqual(['Ann', 'bob'])
    expect(names(where('active', 'eq', true))).toEqual(['Ann', ''])
  })

  it('否定运算符是正向运算符的补集，匹配缺失值', () => {
    expect(names(where('active', 'neq', true))).toEqual(['bob', 'Cid', 'Dee'])
    expect(names(where('age', 'notIn', [30]))).toEqual(['bob', 'Cid', '', 'Dee'])
    expect(names(where('name', 'notContains', 'n'))).toEqual(['bob', 'Cid', '', 'Dee'])
  })

  it('操作数为空的条件不参与筛选', () => {
    const all = ['Ann', 'bob', 'Cid', '', 'Dee']
    expect(names(where('age', 'eq', null))).toEqual(all)
    expect(names(where('age', 'in', []))).toEqual(all)
    expect(names(where('age', 'in', [null]))).toEqual(all)
    expect(names(where('age', 'between', [null, null]))).toEqual(all)
    expect(names(where('age', 'gt', { parameter: 'minAge' }))).toEqual(all)
  })

  it('between 的一端为空即不设该端', () => {
    expect(names(where('age', 'between', [26, null]))).toEqual(['Ann', ''])
    expect(names(where('age', 'between', [null, 30]))).toEqual(['Ann', 'bob'])
    expect(names(where('age', 'between', [25, 30]))).toEqual(['Ann', 'bob'])
  })

  it('全部条件都不参与时全部行通过', () => {
    const filter: FilterGroup = {
      logic: 'or',
      conditions: [
        { id: 'a', field: 'age', operator: 'eq', value: { parameter: 'missing' } },
        { id: 'g', logic: 'and', conditions: [{ id: 'b', field: 'name', operator: 'in', value: [] }] },
      ],
    }
    expect(names(filter)).toHaveLength(5)
  })
})

describe('compileFilter：比较语义', () => {
  it('类型不同的值不相等也不比大小', () => {
    expect(names(where('age', 'eq', 35))).toEqual([])
    expect(names(where('age', 'eq', '35'))).toEqual(['Dee'])
    expect(names(where('age', 'gt', 26))).toEqual(['Ann', ''])
  })

  it('参数引用取参数值，多选参数配 in', () => {
    expect(names(where('age', 'gt', { parameter: 'minAge' }), { parameters: { minAge: 28 } })).toEqual(['Ann', ''])
    expect(names(where('name', 'in', { parameter: 'who' }), { parameters: { who: ['Ann', 'Dee'] } })).toEqual(['Ann', 'Dee'])
    expect(names(where('name', 'in', 'Ann'))).toEqual(['Ann'])
  })

  it('字符串运算符区分大小写，ignoreCase 时忽略', () => {
    expect(names(where('name', 'startsWith', 'b'))).toEqual(['bob'])
    expect(names(where('name', 'startsWith', 'B'))).toEqual([])
    expect(names(where('name', 'startsWith', 'B', { ignoreCase: true }))).toEqual(['bob'])
    expect(names(where('name', 'endsWith', 'E', { ignoreCase: true }))).toEqual(['Dee'])
    expect(names(where('name', 'contains', 'i'))).toEqual(['Cid'])
  })

  it('date 字段两边规范成日期再比，Date 与字符串可以混用', () => {
    expect(names(where('joined', 'gte', '2026-01-01'))).toEqual(['Ann', 'bob', 'Dee'])
    expect(names(where('joined', 'eq', '2026-03-05'))).toEqual(['bob'])
    expect(names(where('joined', 'lt', '2026-03'))).toEqual(['Ann', ''])
    expect(names(where('joined', 'in', ['2026-03-01']))).toEqual(['Dee'])
  })

  it('datetime 字段按时区换算后比较', () => {
    const at = where('seen', 'gte', '2026-10-16T00:00:00')
    expect(names(at)).toEqual(['Ann', 'Dee'])
    expect(names(at, { timeZone: 'Asia/Shanghai' })).toEqual(['Ann', 'bob', '', 'Dee'])
  })

  it('写了 bucket 的条件按粒度键比较', () => {
    expect(names(where('joined', 'eq', '2026-Q1', { bucket: 'quarter' }))).toEqual(['Ann', 'bob', 'Dee'])
    expect(names(where('joined', 'in', ['2025-12', '2026-01'], { bucket: 'month' }))).toEqual(['Ann', ''])
  })

  it('子组按 and / or 组合，追加条件与之同时满足', () => {
    const filter: FilterGroup = {
      logic: 'or',
      conditions: [
        { id: 'a', field: 'age', operator: 'lt', value: 28 },
        { id: 'g', logic: 'and', conditions: [
          { id: 'b', field: 'active', operator: 'eq', value: true },
          { id: 'c', field: 'age', operator: 'gt', value: 35 },
        ] },
      ],
    }
    expect(names(filter)).toEqual(['bob', ''])
    expect(names(filter, {}, [{ id: 'x', field: 'name', operator: 'eq', value: '' }])).toEqual([''])
    expect(names(undefined, {}, [{ id: 'x', field: 'active', operator: 'eq', value: false }])).toEqual(['bob', 'Dee'])
  })

  it('操作数形状不对时抛出 invalid-filter-operand', () => {
    const run = (filter: FilterGroup): unknown => {
      try {
        names(filter)
      }
      catch (error) {
        return error instanceof ReportComputeError ? [error.code, error.params.condition] : error
      }
      return null
    }
    expect(run(where('age', 'eq', [1, 2]))).toEqual(['invalid-filter-operand', 'c'])
    expect(run(where('age', 'between', [1]))).toEqual(['invalid-filter-operand', 'c'])
    expect(run(where('name', 'contains', 1))).toEqual(['invalid-filter-operand', 'c'])
  })
})
