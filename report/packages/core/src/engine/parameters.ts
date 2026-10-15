/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表参数取值的解析与检查。

import type { ReportIssue } from '../issue'
import type { FieldType, ParameterValue, ParameterValues, ReportParameter, ScalarValue } from '../schema'
import { createDateTools } from './date'
import { isMissing, valueKey } from './value'

/** 参数取值的问题码。 */
export type ParameterIssueCode
  = | 'parameter-required'
    | 'parameter-type-mismatch'
    | 'parameter-not-multiple'
    | 'parameter-option-mismatch'
    | 'unknown-parameter'

/** 解析后的参数取值。 */
export interface ResolvedParameters {
  /** 有值的参数：参数名到值；多选参数总是数组。 */
  readonly values: ParameterValues
  readonly issues: readonly ReportIssue<ParameterIssueCode>[]
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function matchesType(value: ScalarValue, type: FieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'date':
    case 'datetime': {
      if (typeof value !== 'string' || (type === 'date' && !DATE_PATTERN.test(value)))
        return false
      try {
        createDateTools().parts(value)
        return true
      }
      catch {
        return false
      }
    }
  }
}

/**
 * 解析报表参数的取值：输入里没有的参数取缺省值，输入写 null 表示不给值。
 * 检查必填、类型（date 为 YYYY-MM-DD，datetime 为 ISO 8601 字符串）、单选多选与候选项，
 * 输入里报表没有声明的参数也报出来。不合格的取值报问题且不进 values。
 */
export function resolveParameters(parameters: readonly ReportParameter[] | undefined, input: Readonly<Record<string, ParameterValue | undefined>> = {}): ResolvedParameters {
  const values: Record<string, ParameterValue> = {}
  const issues: ReportIssue<ParameterIssueCode>[] = []
  const declared = new Set<string>()
  for (const parameter of parameters ?? []) {
    const { name } = parameter
    declared.add(name)
    const path = ['parameters', name]
    const given = Object.hasOwn(input, name) && input[name] !== undefined
    const raw = given ? input[name]! : parameter.defaultValue
    const items = raw === undefined ? [] : (Array.isArray(raw) ? raw : [raw]).filter(item => !isMissing(item))
    if (items.length === 0) {
      if (parameter.required)
        issues.push({ code: 'parameter-required', path })
      continue
    }
    if (Array.isArray(raw) && !parameter.multiple) {
      issues.push({ code: 'parameter-not-multiple', path })
      continue
    }
    const wrong = items.find(item => !matchesType(item, parameter.type))
    if (wrong !== undefined) {
      issues.push({ code: 'parameter-type-mismatch', path, params: { expected: parameter.type } })
      continue
    }
    if (parameter.options) {
      const allowed = new Set(parameter.options.map(option => valueKey(option.value)))
      if (items.some(item => !allowed.has(valueKey(item)))) {
        issues.push({ code: 'parameter-option-mismatch', path })
        continue
      }
    }
    values[name] = parameter.multiple ? items : items[0]!
  }
  for (const name of Object.keys(input)) {
    if (!declared.has(name))
      issues.push({ code: 'unknown-parameter', path: ['parameters', name] })
  }
  return { values, issues }
}
