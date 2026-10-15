/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 校验共用的规则：值类型、格式、公式引用与成员排序。

import type { JsonPath } from '@xihan-ui/core/json'
import type { ExpressionEngine } from '../expression'
import type { FieldType } from '../schema'
import type { Checker, JsonObject } from './checker'
import { isPlainObject } from '@xihan-ui/core/json'
import { checkExpressions, checkFormatSpec } from '@xihan-ui/expression'
import { createDateTools } from '../engine/date'

/** 一个公式：结果名、表达式与它在文档里的位置。 */
export interface FormulaSite {
  readonly name: string
  readonly expression: string
  readonly path: JsonPath
}

const NUMERIC_KINDS = ['number', 'percent'] as const
const DIRECTIONS = ['asc', 'desc'] as const
const NULLS = ['first', 'last'] as const

/** 两种字段类型是否可以互相比较或赋值：相同，或同为日期类。 */
export function typeCompatible(actual: FieldType, expected: FieldType): boolean {
  if (actual === expected)
    return true
  const dates: readonly FieldType[] = ['date', 'datetime']
  return dates.includes(actual) && dates.includes(expected)
}

/** 字面值是否符合字段类型：date / datetime 须是能解析的 ISO 8601 字符串。 */
export function literalMatches(value: unknown, type: FieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'date':
    case 'datetime':
      if (typeof value !== 'string')
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

/** 判断值是否为 JSON 标量。 */
export function isScalar(value: unknown): boolean {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
}

/** 判断值是否为参数引用 { parameter }。 */
export function isParameterRef(value: unknown): value is { readonly parameter: unknown } {
  return isPlainObject(value) && 'parameter' in value
}

/**
 * 校验 owner[key] 处的格式说明（不写时不查）：用 @xihan-ui/expression 的 checkFormatSpec，每条问题报一个 format-invalid，
 * 路径指到出问题的那一项，params.issue 是 checkFormatSpec 的问题码。numeric 为真时只收数字与百分比。
 */
export function checkFormat(c: Checker, owner: JsonObject, key: string, path: JsonPath, numeric = false): void {
  const format = owner[key]
  if (format === undefined)
    return
  for (const issue of checkFormatSpec(format, numeric ? { kinds: NUMERIC_KINDS } : {}))
    c.report('format-invalid', [...path, key, ...issue.path], { issue: issue.code })
}

/** 校验成员排序 { by, direction, nulls }：by 须是 keys 里的键。 */
export function checkAxisSort(c: Checker, owner: JsonObject, path: JsonPath, keys: ReadonlySet<string>): void {
  const sort = c.objectAt(owner, 'sort', path)
  if (!sort)
    return
  const at = [...path, 'sort']
  const by = c.string(sort, 'by', at)
  if (by !== undefined && !keys.has(by))
    c.report('unknown-measure', [...at, 'by'], { key: by })
  c.oneOf(sort, 'direction', at, DIRECTIONS)
  c.oneOf(sort, 'nulls', at, NULLS)
}

/** 校验排序方向与缺失值位置。 */
export function checkSortOrder(c: Checker, owner: JsonObject, path: JsonPath): void {
  c.oneOf(owner, 'direction', path, DIRECTIONS)
  c.oneOf(owner, 'nulls', path, NULLS)
}

/**
 * 校验一组公式：编译不通过报 formula-invalid（params.issue 是第一个问题的码），引用了 known 与这组公式之外的名字报
 * formula-unknown-reference（每个公式里每个名字一次），循环引用报 formula-cycle（报在环上最后一个公式上，params.names 以逗号连接）。
 * 没有引擎时不检查。
 */
export function checkFormulas(c: Checker, engine: ExpressionEngine | undefined, sites: readonly FormulaSite[], known: ReadonlySet<string>): void {
  if (!engine || sites.length === 0)
    return
  const byName = new Map(sites.map(site => [site.name, site]))
  const unknown = new Set<string>()
  const invalid = new Set<string>()
  for (const issue of checkExpressions(engine, sites, { identifiers: name => known.has(name) })) {
    if (issue.code === 'XH_EXPR_CYCLE') {
      const names = 'names' in issue ? issue.names : []
      c.report('formula-cycle', byName.get(names.at(-1)!)!.path, { names: names.join(',') })
      continue
    }
    if (issue.code === 'XH_EXPR_DUPLICATE_NAME' || !('start' in issue))
      continue
    const site = byName.get(issue.name)!
    if (issue.code === 'XH_EXPR_UNKNOWN_IDENTIFIER') {
      const name = String(issue.data?.name)
      const key = JSON.stringify([issue.name, name])
      if (!unknown.has(key)) {
        unknown.add(key)
        c.report('formula-unknown-reference', site.path, { name })
      }
    }
    else if (!invalid.has(issue.name)) {
      invalid.add(issue.name)
      c.report('formula-invalid', site.path, { issue: issue.code })
    }
  }
}
