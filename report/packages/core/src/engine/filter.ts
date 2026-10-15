/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 筛选条件的编译与求值。

import type { DataRow, FieldType, FilterCondition, FilterGroup, FilterNode, Operand, ParameterValues } from '../schema'
import type { DateTools } from './date'
import type { StringCollator } from './value'
import { ReportComputeError } from './errors'
import { compareValues, isMissing, valueKey } from './value'

/** 编译筛选需要的环境。 */
export interface FilterEnvironment {
  readonly parameters: ParameterValues
  readonly dates: DateTools
  /** 字段的类型；不认识的字段为 undefined。 */
  readonly fieldType: (field: string) => FieldType | undefined
  readonly collate?: StringCollator
}

/** 行谓词。 */
export type RowPredicate = (row: DataRow) => boolean

const NEGATIVE_OPERATORS = new Set(['neq', 'notIn', 'notContains'])

/** 操作数的值：参数引用取参数值，未给值的参数为 undefined。 */
export function resolveOperand(operand: Operand | undefined, parameters: ParameterValues): unknown {
  if (operand !== null && typeof operand === 'object' && !Array.isArray(operand))
    return parameters[(operand as { parameter: string }).parameter]
  return operand
}

/** 操作数为空：缺失值，或去掉缺失元素后为空的数组。 */
export function isEmptyOperand(value: unknown): boolean {
  if (Array.isArray(value))
    return value.every(item => isMissing(item))
  return isMissing(value)
}

/** 判断一个节点是否为子组。 */
export function isFilterGroup(node: FilterNode): node is FilterNode & FilterGroup {
  return 'conditions' in node
}

function sameKind(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date)
    return a instanceof Date && b instanceof Date
  return typeof a === typeof b && (typeof a === 'number' || typeof a === 'string' || typeof a === 'boolean')
}

function invalidOperand(condition: FilterCondition): ReportComputeError {
  return new ReportComputeError('invalid-filter-operand', { condition: condition.id, operator: condition.operator })
}

function scalarOperand(condition: FilterCondition, value: unknown): unknown {
  if (Array.isArray(value))
    throw invalidOperand(condition)
  return value
}

function stringOperand(condition: FilterCondition, value: unknown): string {
  if (typeof value !== 'string')
    throw invalidOperand(condition)
  return condition.ignoreCase ? value.toLowerCase() : value
}

function compileCondition(condition: FilterCondition, env: FilterEnvironment): RowPredicate | null {
  const { field, operator } = condition
  if (operator === 'isEmpty')
    return row => isMissing(row[field])
  if (operator === 'isNotEmpty')
    return row => !isMissing(row[field])

  const raw = resolveOperand(condition.value, env.parameters)
  if (isEmptyOperand(raw))
    return null

  const type = env.fieldType(field)
  const bucket = condition.bucket
  const normalizeRow: (value: unknown) => unknown = bucket
    ? value => env.dates.bucket(value, bucket)
    : type === 'date' || type === 'datetime'
      ? value => env.dates.wallClock(value, type)
      : value => value
  const normalizeOperand = bucket ? (value: unknown) => value : normalizeRow
  const negative = NEGATIVE_OPERATORS.has(operator)

  function predicate(test: (value: unknown) => boolean): RowPredicate {
    return (row) => {
      const value = normalizeRow(row[field])
      if (isMissing(value))
        return negative
      return test(value)
    }
  }

  function ordered(target: unknown, accept: (order: number) => boolean): (value: unknown) => boolean {
    return value => sameKind(value, target) && accept(compareValues(value, target, env.collate))
  }

  switch (operator) {
    case 'eq':
    case 'neq': {
      const key = valueKey(normalizeOperand(scalarOperand(condition, raw)))
      return predicate(value => (valueKey(value) === key) !== negative)
    }
    case 'gt':
      return predicate(ordered(normalizeOperand(scalarOperand(condition, raw)), order => order > 0))
    case 'gte':
      return predicate(ordered(normalizeOperand(scalarOperand(condition, raw)), order => order >= 0))
    case 'lt':
      return predicate(ordered(normalizeOperand(scalarOperand(condition, raw)), order => order < 0))
    case 'lte':
      return predicate(ordered(normalizeOperand(scalarOperand(condition, raw)), order => order <= 0))
    case 'between': {
      if (!Array.isArray(raw) || raw.length !== 2)
        throw invalidOperand(condition)
      const lower = isMissing(raw[0]) ? null : ordered(normalizeOperand(raw[0]), order => order >= 0)
      const upper = isMissing(raw[1]) ? null : ordered(normalizeOperand(raw[1]), order => order <= 0)
      return predicate(value => (lower === null || lower(value)) && (upper === null || upper(value)))
    }
    case 'in':
    case 'notIn': {
      const items = (Array.isArray(raw) ? raw : [raw]).filter(item => !isMissing(item))
      const keys = new Set(items.map(item => valueKey(normalizeOperand(item))))
      return predicate(value => keys.has(valueKey(value)) !== negative)
    }
    case 'contains':
    case 'notContains':
    case 'startsWith':
    case 'endsWith': {
      const target = stringOperand(condition, scalarOperand(condition, raw))
      const match = operator === 'startsWith'
        ? (text: string) => text.startsWith(target)
        : operator === 'endsWith'
          ? (text: string) => text.endsWith(target)
          : (text: string) => text.includes(target)
      return predicate((value) => {
        if (typeof value !== 'string')
          return negative
        return match(condition.ignoreCase ? value.toLowerCase() : value) !== negative
      })
    }
  }
}

function compileNode(node: FilterNode | FilterGroup, env: FilterEnvironment): RowPredicate | null {
  if (!('conditions' in node))
    return compileCondition(node, env)
  const parts = node.conditions
    .map(child => compileNode(child, env))
    .filter((part): part is RowPredicate => part !== null)
  if (parts.length === 0)
    return null
  if (parts.length === 1)
    return parts[0]!
  return node.logic === 'and'
    ? row => parts.every(part => part(row))
    : row => parts.some(part => part(row))
}

/**
 * 把筛选编译成行谓词。extra 里的条件与 group 同时满足。
 *
 * 缺失值语义：
 * - isEmpty 匹配缺失值，isNotEmpty 匹配非缺失值；
 * - 正向运算符（eq、gt、between、in、contains……）不匹配缺失值；
 * - 否定运算符（neq、notIn、notContains）是对应正向运算符的补集，因而匹配缺失值；
 * - 操作数为空（缺失、未给值的参数、去掉缺失元素后为空的数组）的条件不参与筛选；
 *   between 的一端为空即不设该端，两端都空不参与筛选；
 * - 子组里的条件全都不参与时，子组也不参与；整棵树都不参与时全部行通过。
 *
 * 比较语义：值与操作数类型不同时大小比较不成立；date / datetime 字段两边先规范成墙上时间再比；
 * 写了 bucket 的条件先把字段值按粒度取键，操作数直接写键（如 2026-10）。
 */
export function compileFilter(group: FilterGroup | undefined, extra: readonly FilterCondition[], env: FilterEnvironment): RowPredicate {
  const root: FilterGroup = {
    logic: 'and',
    conditions: group ? [{ id: '', ...group }, ...extra] : extra,
  }
  return compileNode(root, env) ?? (() => true)
}
