/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表路径的解析与属性修改：数组上按 id / name 写的段先换成下标，检查键重复，再交给 @xihan-ui/designer-kit 的路径编辑操作。

import type { JsonPath, JsonPathSegment } from '@xihan-ui/core/json'
import type { PathOperation } from '@xihan-ui/designer-kit'
import type { JsonValue } from '../schema'
import type { PropertyChange, ReportOperation, ReportPath } from './types'
import { cloneJson, findJsonViolation, getJsonAt, isPlainObject, jsonEquals, JsonPathError } from '@xihan-ui/core/json'
import { applyPathOperation, PathOperationError } from '@xihan-ui/designer-kit'
import { ReportOperationError } from './errors'

/** 数组项的键：id，没有 id 时取 name；都不是字符串时为 undefined。 */
export function itemKey(item: unknown): string | undefined {
  if (!isPlainObject(item))
    return undefined
  if (typeof item.id === 'string')
    return item.id
  return typeof item.name === 'string' ? item.name : undefined
}

/** 把报表路径换成 JSON 路径：数组上写成字符串的段按 itemKey 换成下标；数组里找不到这个键时为 undefined。 */
export function resolvePath(root: JsonValue | undefined, path: ReportPath): JsonPath | undefined {
  const resolved: JsonPathSegment[] = []
  let node: JsonValue | undefined = root
  for (const segment of path) {
    let next: JsonPathSegment = segment
    if (Array.isArray(node) && typeof segment === 'string') {
      const index = (node as readonly JsonValue[]).findIndex(item => itemKey(item) === segment)
      if (index < 0)
        return undefined
      next = index
    }
    resolved.push(next)
    node = node === undefined ? undefined : getJsonAt(node, [next])
  }
  return resolved
}

/** 读取路径处的值；路径不存在时为 undefined，路径段不合法（负数、小数、原型键）时抛 JsonPathError。 */
export function readPath(root: unknown, path: ReportPath): unknown {
  const resolved = resolvePath(root as JsonValue, path)
  return resolved === undefined ? undefined : getJsonAt(root as JsonValue, resolved)
}

/** 执行一个路径编辑操作，把路径与取值错误换成 ReportOperationError。 */
export function runPath(root: JsonValue, path: PathOperation, operation: ReportOperation): { readonly document: JsonValue, readonly inverse: readonly PathOperation[] } {
  try {
    return applyPathOperation(root, path)
  }
  catch (error) {
    if (error instanceof PathOperationError || error instanceof JsonPathError)
      throw new ReportOperationError(error.code, operation, { cause: error })
    throw error
  }
}

/** 深拷贝写入的值；不是 JSON 时抛 invalid-value。 */
export function copyValue<T>(value: T, operation: ReportOperation): T {
  if (value === undefined || findJsonViolation(value as JsonValue) !== undefined)
    throw new ReportOperationError('invalid-value', operation)
  return cloneJson(value as JsonValue) as T
}

/** 同一数组里除 except 处之外已有与 value 同键的项时抛 duplicate-key。 */
export function checkUniqueKey(array: readonly JsonValue[], value: unknown, except: number, operation: ReportOperation): void {
  const key = itemKey(value)
  if (key !== undefined && array.some((item, i) => i !== except && itemKey(item) === key))
    throw new ReportOperationError('duplicate-key', operation)
}

/** 替换数组项，或改数组项的 id / name，会使同一数组里出现重复的键时抛 duplicate-key；没有变化的替换不算。 */
function checkKeys(root: JsonValue, path: JsonPath, value: JsonValue | undefined, operation: ReportOperation): void {
  const last = path.at(-1)!
  const parent = getJsonAt(root, path.slice(0, -1))
  if (Array.isArray(parent) && typeof last === 'number' && last < parent.length && !jsonEquals(parent[last], value)) {
    checkUniqueKey(parent, value, last, operation)
    return
  }
  const index = path.at(-2)
  const array = path.length >= 2 ? getJsonAt(root, path.slice(0, -2)) : undefined
  if ((last === 'id' || last === 'name') && typeof index === 'number' && Array.isArray(array) && isPlainObject(parent)) {
    const renamed: Record<string, unknown> = { ...parent }
    if (value === undefined)
      delete renamed[last]
    else
      renamed[last] = value
    if (itemKey(renamed) !== itemKey(parent))
      checkUniqueKey(array, renamed, index, operation)
  }
}

/** 逆操作的绝对路径换回相对 base 的属性修改。 */
function relativeChange(inverse: PathOperation, base: JsonPath): PropertyChange {
  const path = inverse.path.slice(base.length)
  if (inverse.type === 'set' && inverse.value !== undefined)
    return { path, value: inverse.value }
  return { path }
}

/**
 * 依次把属性修改写到 base 处的对象上，不修改原文档，返回新根与按相反顺序排列的逆修改（路径按下标写）。
 * 路径相对 base，数组项可写 id / name；首段落在 protectedKeys 里时抛 protected-path，空路径抛 invalid-path，
 * 中间缺少的对象属性补成空对象，写入的值先深拷贝。
 */
export function writeChanges(
  root: JsonValue,
  base: JsonPath,
  changes: readonly PropertyChange[],
  protectedKeys: readonly string[],
  operation: ReportOperation,
): { readonly root: JsonValue, readonly undo: readonly PropertyChange[] } {
  if (!Array.isArray(changes))
    throw new ReportOperationError('invalid-operation', operation)
  let current = root
  const undo: PropertyChange[] = []
  for (const change of changes) {
    if (typeof change !== 'object' || change === null || !Array.isArray(change.path))
      throw new ReportOperationError('invalid-operation', operation)
    if (change.path.length === 0)
      throw new ReportOperationError('invalid-path', operation)
    const head = change.path[0]
    if (typeof head === 'string' && protectedKeys.includes(head))
      throw new ReportOperationError('protected-path', operation)
    let relative: JsonPath | undefined
    try {
      relative = resolvePath(getJsonAt(current, base), change.path)
    }
    catch (error) {
      if (error instanceof JsonPathError)
        throw new ReportOperationError(error.code, operation, { cause: error })
      throw error
    }
    if (relative === undefined)
      throw new ReportOperationError('path-not-found', operation)
    const path = [...base, ...relative]
    const value = change.value === undefined ? undefined : copyValue(change.value, operation)
    checkKeys(current, path, value, operation)
    const result = runPath(current, value === undefined ? { type: 'set', path, createMissing: true } : { type: 'set', path, value, createMissing: true }, operation)
    current = result.document
    undo.unshift(...result.inverse.map(inverse => relativeChange(inverse, base)))
  }
  return { root: current, undo }
}
