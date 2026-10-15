/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 校验用的读取器：按类型读取属性，不合格时记下问题。

import type { ReportIssue, ReportPath } from '../issue'
import type { ScalarValue } from '../schema'
import { isPlainObject } from '@xihan-ui/core/json'

/** 校验问题码。 */
export type ValidationIssueCode
  = | 'aggregate-type-mismatch'
    | 'bucket-type-mismatch'
    | 'chart-reference-role'
    | 'duplicate-key'
    | 'empty'
    | 'format-invalid'
    | 'formula-cycle'
    | 'formula-invalid'
    | 'formula-unknown-reference'
    | 'invalid-type'
    | 'invalid-value'
    | 'layout-out-of-bounds'
    | 'layout-overlap'
    | 'link-target-type-mismatch'
    | 'measure-definition'
    | 'operand-required'
    | 'operand-shape'
    | 'operand-type-mismatch'
    | 'operator-type-mismatch'
    | 'required'
    | 'reserved-name'
    | 'unknown-card'
    | 'unknown-dataset'
    | 'unknown-dataset-parameter'
    | 'unknown-dimension'
    | 'unknown-field'
    | 'unknown-key'
    | 'unknown-measure'
    | 'unknown-parameter'
    | 'unknown-series'
    | 'unsupported-schema-version'

/** 一条校验问题。 */
export type ValidationIssue = ReportIssue<ValidationIssueCode>

/** 一个对象值。 */
export type JsonObject = Readonly<Record<string, unknown>>

/** 一个带键的数组项。 */
export interface KeyedItem {
  readonly item: JsonObject
  readonly path: ReportPath
  /** 合法且不重复的键；缺失、不是字符串或重复时为 undefined。 */
  readonly key: string | undefined
}

/** 数值约束。 */
export interface NumberRule {
  readonly required?: boolean
  readonly integer?: boolean
  readonly min?: number
  readonly max?: number
  /** 必须大于 min。 */
  readonly exclusiveMin?: boolean
}

/** 收集问题并按类型读取属性。 */
export class Checker {
  readonly issues: ValidationIssue[] = []

  report(code: ValidationIssueCode, path: ReportPath, params?: Readonly<Record<string, ScalarValue>>): void {
    this.issues.push(params ? { code, path, params } : { code, path })
  }

  /** 读取对象；不是对象时记 invalid-type。 */
  object(value: unknown, path: ReportPath): JsonObject | undefined {
    if (isPlainObject(value))
      return value
    this.report('invalid-type', path, { expected: 'object' })
    return undefined
  }

  /** 读取对象属性里的对象。 */
  objectAt(owner: JsonObject, key: string, path: ReportPath, required = false): JsonObject | undefined {
    const value = owner[key]
    if (value === undefined) {
      if (required)
        this.report('required', [...path, key])
      return undefined
    }
    return this.object(value, [...path, key])
  }

  string(owner: JsonObject, key: string, path: ReportPath, required = false): string | undefined {
    const value = owner[key]
    if (value === undefined) {
      if (required)
        this.report('required', [...path, key])
      return undefined
    }
    if (typeof value !== 'string') {
      this.report('invalid-type', [...path, key], { expected: 'string' })
      return undefined
    }
    if (required && value === '') {
      this.report('required', [...path, key])
      return undefined
    }
    return value
  }

  boolean(owner: JsonObject, key: string, path: ReportPath): boolean | undefined {
    const value = owner[key]
    if (value === undefined)
      return undefined
    if (typeof value !== 'boolean') {
      this.report('invalid-type', [...path, key], { expected: 'boolean' })
      return undefined
    }
    return value
  }

  number(owner: JsonObject, key: string, path: ReportPath, rule: NumberRule = {}): number | undefined {
    const value = owner[key]
    if (value === undefined) {
      if (rule.required)
        this.report('required', [...path, key])
      return undefined
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.report('invalid-type', [...path, key], { expected: rule.integer ? 'integer' : 'number' })
      return undefined
    }
    if (rule.integer && !Number.isInteger(value)) {
      this.report('invalid-type', [...path, key], { expected: 'integer' })
      return undefined
    }
    const tooSmall = rule.min !== undefined && (rule.exclusiveMin ? value <= rule.min : value < rule.min)
    const tooLarge = rule.max !== undefined && value > rule.max
    if (tooSmall || tooLarge) {
      const params: Record<string, ScalarValue> = {}
      if (rule.min !== undefined)
        params.min = rule.min
      if (rule.max !== undefined)
        params.max = rule.max
      this.report('invalid-value', [...path, key], params)
      return undefined
    }
    return value
  }

  /** 读取取值限定在 values 里的字符串。 */
  oneOf<T extends string>(owner: JsonObject, key: string, path: ReportPath, values: readonly T[], required = false): T | undefined {
    const value = owner[key]
    if (value === undefined) {
      if (required)
        this.report('required', [...path, key])
      return undefined
    }
    if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
      this.report('invalid-value', [...path, key], { expected: values.join('|') })
      return undefined
    }
    return value as T
  }

  array(owner: JsonObject, key: string, path: ReportPath, required = false, nonEmpty = false): readonly unknown[] | undefined {
    const value = owner[key]
    if (value === undefined) {
      if (required)
        this.report('required', [...path, key])
      return undefined
    }
    if (!Array.isArray(value)) {
      this.report('invalid-type', [...path, key], { expected: 'array' })
      return undefined
    }
    if (nonEmpty && value.length === 0)
      this.report('empty', [...path, key])
    return value
  }

  /**
   * 读取带键的数组：每项须是对象且 keyName 是非空字符串，键在 scope 里不重复。
   * 项的路径用键；键不合法或重复时用下标。
   */
  keyed(owner: JsonObject, key: string, path: ReportPath, keyName: 'id' | 'name', options: { required?: boolean, nonEmpty?: boolean, scope?: Set<string> } = {}): KeyedItem[] {
    const items = this.array(owner, key, path, options.required, options.nonEmpty)
    if (!items)
      return []
    return this.keyedItems(items, [...path, key], keyName, options.scope ?? new Set())
  }

  /** 读取一组带键的项，规则同 keyed。 */
  keyedItems(items: readonly unknown[], path: ReportPath, keyName: 'id' | 'name', scope: Set<string>): KeyedItem[] {
    const result: KeyedItem[] = []
    items.forEach((value, index) => {
      if (!isPlainObject(value)) {
        this.report('invalid-type', [...path, index], { expected: 'object' })
        return
      }
      const raw = value[keyName]
      if (typeof raw !== 'string' || raw === '') {
        this.report(raw === undefined ? 'required' : 'invalid-type', [...path, index, keyName], raw === undefined ? undefined : { expected: 'string' })
        result.push({ item: value, path: [...path, index], key: undefined })
        return
      }
      if (scope.has(raw)) {
        this.report('duplicate-key', [...path, index], { key: raw })
        result.push({ item: value, path: [...path, index], key: undefined })
        return
      }
      scope.add(raw)
      result.push({ item: value, path: [...path, raw], key: raw })
    })
    return result
  }
}
