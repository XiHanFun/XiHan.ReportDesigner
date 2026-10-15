/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 编辑操作：把报表路径里按 id / name 写的数组项换成下标，检查键重复，再交给 @xihan-ui/designer-kit 的路径编辑操作。

import type { JsonPath, JsonPathSegment } from '@xihan-ui/core/json'
import type { PathOperation } from '@xihan-ui/designer-kit'
import type { ReportPath } from './issue'
import type { JsonValue, ReportDocument } from './schema'
import { getJsonAt, isPlainObject, jsonEquals, JsonPathError } from '@xihan-ui/core/json'
import { applyInSequence, applyPathOperation, PathOperationError } from '@xihan-ui/designer-kit'

/**
 * 编辑操作；全部是纯 JSON。路径写法同问题定位：对象属性写属性名，
 * 数组项写它的 id（没有 id 时取 name），也可以写下标。
 * - set：把路径处的值换成 value；value 不写时删除对象属性。路径指向对象属性时属性可以原本不存在，
 *   createMissing 为 true 时中间缺少的对象属性补成空对象；空路径替换整个文档。
 * - insert：在路径所指的数组里插入 value，index 缺省插到末尾；
 * - remove：删除路径所指的对象属性或数组项；
 * - move：把路径所指的数组项移到同一数组的 index 处。
 * 逆操作的路径一律按下标写。
 */
export type ReportOperation
  = | { readonly type: 'set', readonly path: ReportPath, readonly value?: JsonValue, readonly createMissing?: boolean }
    | { readonly type: 'insert', readonly path: ReportPath, readonly index?: number, readonly value: JsonValue }
    | { readonly type: 'remove', readonly path: ReportPath }
    | { readonly type: 'move', readonly path: ReportPath, readonly index: number }

/** 应用操作的结果：新文档，与按顺序应用即可撤销的逆操作。 */
export interface ReportOperationResult {
  readonly document: ReportDocument
  readonly inverse: readonly ReportOperation[]
}

/** 操作失败的原因：duplicate-key 由报表检查，其余同 designer-kit 的路径编辑操作。 */
export type ReportOperationErrorCode
  = | 'duplicate-key'
    | 'index-out-of-range'
    | 'invalid-operation'
    | 'invalid-path'
    | 'invalid-value'
    | 'not-an-array'
    | 'path-not-found'

/** 操作无法应用时抛出的错误：message 即错误码，输入文档保持不变。 */
export class ReportOperationError extends Error {
  readonly code: ReportOperationErrorCode
  readonly operation: ReportOperation

  constructor(code: ReportOperationErrorCode, operation: ReportOperation, options?: ErrorOptions) {
    super(code, options)
    this.name = 'ReportOperationError'
    this.code = code
    this.operation = operation
  }
}

/** 数组项的键：id，没有 id 时取 name；都不是字符串时为 undefined。 */
export function itemKey(item: unknown): string | undefined {
  if (!isPlainObject(item))
    return undefined
  if (typeof item.id === 'string')
    return item.id
  return typeof item.name === 'string' ? item.name : undefined
}

/** 把报表路径换成 JSON 路径：数组上写成字符串的段按 itemKey 换成下标；数组里找不到这个键时为 undefined。 */
function resolvePath(root: JsonValue, path: ReportPath): JsonPath | undefined {
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
    node = getJsonAt(node, [next])
  }
  return resolved
}

/** 读取路径处的值；路径不存在时为 undefined，路径段不合法（负数、小数、原型键）时抛 JsonPathError。 */
export function readPath(root: unknown, path: ReportPath): unknown {
  const resolved = resolvePath(root as JsonValue, path)
  return resolved === undefined ? undefined : getJsonAt(root as JsonValue, resolved)
}

function checkUniqueKey(array: readonly JsonValue[], value: unknown, except: number, operation: ReportOperation): void {
  const key = itemKey(value)
  if (key !== undefined && array.some((item, i) => i !== except && itemKey(item) === key))
    throw new ReportOperationError('duplicate-key', operation)
}

/**
 * 插入数组项、替换数组项，或改数组项的 id / name，会使同一数组里出现重复的键时抛 duplicate-key；
 * 没有变化的替换不算。
 */
function checkKeys(document: JsonValue, operation: ReportOperation, path: JsonPath): void {
  if (operation.type === 'insert') {
    const array = getJsonAt(document, path)
    if (Array.isArray(array))
      checkUniqueKey(array, operation.value, -1, operation)
    return
  }
  if (operation.type !== 'set' || path.length === 0)
    return
  const last = path.at(-1)!
  const parent = getJsonAt(document, path.slice(0, -1))
  if (Array.isArray(parent) && typeof last === 'number' && last < parent.length && !jsonEquals(parent[last], operation.value)) {
    checkUniqueKey(parent, operation.value, last, operation)
    return
  }
  const index = path.at(-2)
  const array = path.length >= 2 ? getJsonAt(document, path.slice(0, -2)) : undefined
  if ((last === 'id' || last === 'name') && typeof index === 'number' && Array.isArray(array) && isPlainObject(parent)) {
    const renamed: Record<string, unknown> = { ...parent }
    if (operation.value === undefined)
      delete renamed[last]
    else
      renamed[last] = operation.value
    if (itemKey(renamed) !== itemKey(parent))
      checkUniqueKey(array, renamed, index, operation)
  }
}

/**
 * 应用一个编辑操作，返回新文档与逆操作；不修改输入文档，没有改到的部分沿用原引用。
 * 操作没有带来变化时返回同一个文档引用与空的逆操作。整个文档只能换成对象，否则抛 invalid-value。
 * 插入或替换使同一数组里出现重复的键时抛出 duplicate-key；操作只保证路径与键，引用完整性由 validateDocument 检查。
 */
export function applyOperation(document: ReportDocument, operation: ReportOperation): ReportOperationResult {
  if (!isPlainObject(operation) || !Array.isArray(operation.path))
    throw new ReportOperationError('invalid-operation', operation)
  const root = document as unknown as JsonValue
  try {
    const path = resolvePath(root, operation.path)
    if (path === undefined)
      throw new ReportOperationError('path-not-found', operation)
    if (operation.type === 'set' && path.length === 0 && !isPlainObject(operation.value))
      throw new ReportOperationError('invalid-value', operation)
    checkKeys(root, operation, path)
    const result = applyPathOperation(root, { ...operation, path } as PathOperation)
    return { document: result.document as unknown as ReportDocument, inverse: result.inverse as readonly ReportOperation[] }
  }
  catch (error) {
    if (error instanceof PathOperationError || error instanceof JsonPathError)
      throw new ReportOperationError(error.code, operation, { cause: error })
    throw error
  }
}

/** 依次应用一组操作；逆操作为各操作的逆操作按反序拼接。任一操作失败时抛出，输入文档保持不变。 */
export function applyOperations(document: ReportDocument, operations: readonly ReportOperation[]): ReportOperationResult {
  return applyInSequence(applyOperation, document, operations)
}
