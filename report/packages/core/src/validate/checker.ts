/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 校验用的读取器：问题形状与按类型读取用 @xihan-ui/designer-kit/schema，这里补上报表的必填写法与带键数组。

import type { JsonPath } from '@xihan-ui/core/json'
import type { CommonIssueCode, IssueParamValue, IssueSink, NumberRule as ReadNumberRule, SchemaIssue } from '@xihan-ui/designer-kit/schema'
import { isPlainObject } from '@xihan-ui/core/json'
import { createIssueSink, readArray, readBoolean, readNumber, readObject, readOneOf, readString } from '@xihan-ui/designer-kit/schema'

/** 报表自己的校验问题码，按字母序；通用问题码见 @xihan-ui/designer-kit/schema 的 CommonIssueCode。报表的校验问题都是错误级。 */
export const REPORT_ISSUE_CODES = [
  'aggregate-type-mismatch',
  'bucket-type-mismatch',
  'chart-reference-role',
  'format-invalid',
  'formula-cycle',
  'formula-invalid',
  'formula-unknown-reference',
  'layout-out-of-bounds',
  'layout-overlap',
  'link-target-type-mismatch',
  'measure-definition',
  'operand-required',
  'operand-shape',
  'operand-type-mismatch',
  'operator-type-mismatch',
  'reserved-name',
  'unknown-card',
  'unknown-dataset',
  'unknown-dataset-parameter',
  'unknown-dimension',
  'unknown-field',
  'unknown-kind',
  'unknown-measure',
  'unknown-parameter',
  'unknown-series',
  'unsupported-schema-version',
] as const

/** 校验问题码：designer-kit/schema 的通用问题码、报表自己的（REPORT_ISSUE_CODES），以及扩展的问题码（扩展 id 的末段、一个点、码）。 */
export type ValidationIssueCode = CommonIssueCode | (typeof REPORT_ISSUE_CODES)[number] | `${string}.${string}`

/** 一条校验问题：path 只用对象键与数组下标，target 指出所在的带键对象。 */
export type ValidationIssue = SchemaIssue<ValidationIssueCode>

/** 一个对象值。 */
export type JsonObject = Readonly<Record<string, unknown>>

/** 一个带键的数组项。 */
export interface KeyedItem {
  readonly item: JsonObject
  /** 项的路径，最后一段是下标。 */
  readonly path: JsonPath
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

/** 收集问题并按类型读取属性；required 为真时，属性缺失报 required。 */
export class Checker {
  private readonly sink: IssueSink<ValidationIssueCode> = createIssueSink<ValidationIssueCode>()

  get issues(): readonly ValidationIssue[] {
    return this.sink.issues
  }

  report(code: ValidationIssueCode, path: JsonPath, params?: Readonly<Record<string, IssueParamValue>>): void {
    this.sink.report(code, path, params ? { params } : undefined)
  }

  /** 记下别处查出的问题：扩展种类的校验、扩展数据与追加属性的检查。 */
  add(issues: readonly SchemaIssue[]): void {
    for (const issue of issues)
      this.sink.report(issue.code as ValidationIssueCode, issue.path, issue.params ? { params: issue.params } : undefined)
  }

  private missing(owner: JsonObject, key: string, path: JsonPath, required: boolean | undefined): boolean {
    if (owner[key] !== undefined)
      return false
    if (required)
      this.report('required', [...path, key])
    return true
  }

  /** 读取对象；不是对象时记 invalid-type。 */
  object(value: unknown, path: JsonPath): JsonObject | undefined {
    return readObject(this.sink, value, path)
  }

  /** 读取对象属性里的对象。 */
  objectAt(owner: JsonObject, key: string, path: JsonPath, required = false): JsonObject | undefined {
    return this.missing(owner, key, path, required) ? undefined : readObject(this.sink, owner[key], [...path, key])
  }

  /** 读取字符串；required 时空串报 empty。 */
  string(owner: JsonObject, key: string, path: JsonPath, required = false): string | undefined {
    return this.missing(owner, key, path, required) ? undefined : readString(this.sink, owner[key], [...path, key], { nonEmpty: required })
  }

  boolean(owner: JsonObject, key: string, path: JsonPath): boolean | undefined {
    return readBoolean(this.sink, owner[key], [...path, key])
  }

  /** 读取有限数字：不是整数报 not-integer，越界报 out-of-range。 */
  number(owner: JsonObject, key: string, path: JsonPath, rule: NumberRule = {}): number | undefined {
    if (this.missing(owner, key, path, rule.required))
      return undefined
    const bounds: ReadNumberRule = {
      ...(rule.integer ? { integer: true } : {}),
      ...(rule.min === undefined ? {} : rule.exclusiveMin ? { exclusiveMin: rule.min } : { min: rule.min }),
      ...(rule.max === undefined ? {} : { max: rule.max }),
    }
    return readNumber(this.sink, owner[key], [...path, key], bounds)
  }

  /** 读取取值限定在 values 里的字符串；不在其中报 invalid-option。 */
  oneOf<T extends string>(owner: JsonObject, key: string, path: JsonPath, values: readonly T[], required = false): T | undefined {
    return this.missing(owner, key, path, required) ? undefined : readOneOf(this.sink, owner[key], [...path, key], values)
  }

  /** 读取数组；nonEmpty 时空数组报 empty。 */
  array(owner: JsonObject, key: string, path: JsonPath, required = false, nonEmpty = false): readonly unknown[] | undefined {
    if (this.missing(owner, key, path, required))
      return undefined
    const items = readArray(this.sink, owner[key], [...path, key])
    if (items && nonEmpty && items.length === 0)
      this.report('empty', [...path, key])
    return items
  }

  /**
   * 读取带键的数组：每项须是对象且 keyName 是非空字符串，键在 scope 里不重复。
   * 项的路径一律用下标；键重复的项报 duplicate-key。
   */
  keyed(owner: JsonObject, key: string, path: JsonPath, keyName: 'id' | 'name', options: { required?: boolean, nonEmpty?: boolean, scope?: Set<string> } = {}): KeyedItem[] {
    const items = this.array(owner, key, path, options.required, options.nonEmpty)
    if (!items)
      return []
    return this.keyedItems(items, [...path, key], keyName, options.scope ?? new Set())
  }

  /** 读取一组带键的项，规则同 keyed。 */
  keyedItems(items: readonly unknown[], path: JsonPath, keyName: 'id' | 'name', scope: Set<string>): KeyedItem[] {
    const result: KeyedItem[] = []
    items.forEach((value, index) => {
      const at = [...path, index]
      if (!isPlainObject(value)) {
        this.report('invalid-type', at, { expected: 'object' })
        return
      }
      const raw = this.string(value, keyName, at, true)
      if (raw !== undefined && scope.has(raw))
        this.report('duplicate-key', at, { key: raw })
      const unique = raw !== undefined && !scope.has(raw)
      if (unique)
        scope.add(raw)
      result.push({ item: value, path: at, key: unique ? raw : undefined })
    })
    return result
  }
}
