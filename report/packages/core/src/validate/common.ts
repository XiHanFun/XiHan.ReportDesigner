/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 校验共用的规则：值类型、格式、公式引用与成员排序。

import type { ExpressionEngine } from '../expression'
import type { ReportPath } from '../issue'
import type { FieldType } from '../schema'
import type { Checker, JsonObject } from './checker'
import { createDateTools } from '../engine/date'
import { FORMAT_DECIMALS_LIMIT, FORMAT_ROUNDINGS } from '../schema'
import { isObject } from './checker'

/** 一个公式：结果名、表达式与它在文档里的位置。 */
export interface FormulaSite {
  readonly name: string
  readonly expression: string
  readonly path: ReportPath
}

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
  return isObject(value) && 'parameter' in value
}

/**
 * 校验格式说明；numeric 为真时只接受 number 与 percent。
 * decimals 与 minDecimals / maxDecimals 同时给、minDecimals 大于 maxDecimals 时报 invalid-value。
 */
export function checkFormat(c: Checker, owner: JsonObject, key: string, path: ReportPath, numeric = false): void {
  const format = c.objectAt(owner, key, path)
  if (!format)
    return
  const at = [...path, key]
  const kinds = numeric ? (['number', 'percent'] as const) : (['number', 'percent', 'date', 'rmb-upper'] as const)
  const kind = c.oneOf(format, 'kind', at, kinds, true)
  if (kind === 'number' || kind === 'percent') {
    const digits = { integer: true, min: 0, max: FORMAT_DECIMALS_LIMIT }
    const decimals = c.number(format, 'decimals', at, digits)
    const min = c.number(format, 'minDecimals', at, digits)
    const max = c.number(format, 'maxDecimals', at, digits)
    if (decimals !== undefined && (min !== undefined || max !== undefined))
      c.report('invalid-value', [...at, 'decimals'], { expected: 'decimals|minDecimals,maxDecimals' })
    if (min !== undefined && max !== undefined && min > max)
      c.report('invalid-value', [...at, 'minDecimals'], { max })
    c.boolean(format, 'grouping', at)
    c.oneOf(format, 'rounding', at, FORMAT_ROUNDINGS)
  }
  else if (kind === 'date') {
    c.string(format, 'pattern', at, true)
  }
  else if (kind === 'rmb-upper') {
    c.oneOf(format, 'rounding', at, FORMAT_ROUNDINGS)
  }
}

/** 校验成员排序 { by, direction, nulls }：by 须是 keys 里的键。 */
export function checkAxisSort(c: Checker, owner: JsonObject, path: ReportPath, keys: ReadonlySet<string>): void {
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
export function checkSortOrder(c: Checker, owner: JsonObject, path: ReportPath): void {
  c.oneOf(owner, 'direction', path, DIRECTIONS)
  c.oneOf(owner, 'nulls', path, NULLS)
}

/**
 * 校验一组公式：编译不通过报 formula-invalid（params.issue 是第一条表达式问题的问题码），
 * 引用 known 之外的名字报 formula-unknown-reference，公式之间循环引用时在闭合环的那个公式上报 formula-cycle。
 */
export function checkFormulas(c: Checker, compiler: ExpressionEngine | undefined, sites: readonly FormulaSite[], known: ReadonlySet<string>): void {
  if (!compiler || sites.length === 0)
    return
  const references = new Map<string, readonly string[]>()
  const byName = new Map(sites.map(site => [site.name, site]))
  for (const site of sites) {
    const result = compiler.compile(site.expression)
    if (!result.ok) {
      const first = result.issues[0]
      c.report('formula-invalid', site.path, first ? { issue: first.code } : undefined)
      continue
    }
    const refs = result.references
    references.set(site.name, refs)
    for (const name of new Set(refs)) {
      if (!known.has(name))
        c.report('formula-unknown-reference', site.path, { name })
    }
  }
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []
  function visit(name: string): void {
    state.set(name, 'visiting')
    stack.push(name)
    for (const next of references.get(name) ?? []) {
      if (!references.has(next))
        continue
      const mark = state.get(next)
      if (mark === 'visiting')
        c.report('formula-cycle', byName.get(name)!.path, { names: stack.slice(stack.indexOf(next)).join(',') })
      else if (mark === undefined)
        visit(next)
    }
    stack.pop()
    state.set(name, 'done')
  }
  for (const name of references.keys()) {
    if (!state.has(name))
      visit(name)
  }
}
