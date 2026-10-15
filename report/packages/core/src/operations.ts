/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 编辑操作：按路径设置、插入、删除与移动，返回新文档与逆操作。

import type { ReportPath } from './issue'
import type { JsonValue, ReportDocument } from './schema'

/**
 * 编辑操作；全部是纯 JSON。路径写法同问题定位：对象属性写属性名，
 * 数组项写它的 id（没有 id 时取 name），也可以写下标。
 * - set：把路径处的值换成 value；路径指向对象属性时属性可以原本不存在，空路径替换整个文档；
 * - insert：在路径所指的数组里插入 value，index 缺省插到末尾；
 * - remove：删除路径所指的对象属性或数组项；
 * - move：把路径所指的数组项移到同一数组的 index 处。
 */
export type ReportOperation
  = | { readonly type: 'set', readonly path: ReportPath, readonly value: JsonValue }
    | { readonly type: 'insert', readonly path: ReportPath, readonly index?: number, readonly value: JsonValue }
    | { readonly type: 'remove', readonly path: ReportPath }
    | { readonly type: 'move', readonly path: ReportPath, readonly index: number }

/** 应用操作的结果：新文档，与按顺序应用即可撤销的逆操作。 */
export interface ReportOperationResult {
  readonly document: ReportDocument
  readonly inverse: readonly ReportOperation[]
}

/** 操作失败的原因。 */
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

  constructor(code: ReportOperationErrorCode, operation: ReportOperation) {
    super(code)
    this.name = 'ReportOperationError'
    this.code = code
    this.operation = operation
  }
}

type Container = Readonly<Record<string, unknown>> | readonly unknown[]

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 数组项的键：id，没有 id 时取 name；都不是字符串时为 undefined。 */
export function itemKey(item: unknown): string | undefined {
  if (!isRecord(item))
    return undefined
  if (typeof item.id === 'string')
    return item.id
  return typeof item.name === 'string' ? item.name : undefined
}

function isJson(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true
  if (typeof value === 'number')
    return Number.isFinite(value)
  if (Array.isArray(value))
    return value.every(isJson)
  if (typeof value !== 'object')
    return false
  const prototype = Object.getPrototypeOf(value) as unknown
  if (prototype !== Object.prototype && prototype !== null)
    return false
  return Object.values(value).every(isJson)
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b)
    return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false
    return a.every((item, i) => jsonEqual(item, b[i]))
  }
  if (!isRecord(a) || !isRecord(b))
    return false
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length)
    return false
  return keys.every(key => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]))
}

function indexIn(array: readonly unknown[], segment: string | number): number {
  if (typeof segment === 'number')
    return Number.isInteger(segment) && segment >= 0 && segment < array.length ? segment : -1
  return array.findIndex(item => itemKey(item) === segment)
}

function child(container: unknown, segment: string | number): { found: boolean, value: unknown } {
  if (Array.isArray(container)) {
    const index = indexIn(container, segment)
    return index < 0 ? { found: false, value: undefined } : { found: true, value: container[index] }
  }
  if (isRecord(container) && typeof segment === 'string' && Object.hasOwn(container, segment))
    return { found: true, value: container[segment] }
  return { found: false, value: undefined }
}

/** 读取路径处的值；路径不存在时为 undefined。 */
export function readPath(root: unknown, path: ReportPath): unknown {
  let current = root
  for (const segment of path) {
    const next = child(current, segment)
    if (!next.found)
      return undefined
    current = next.value
  }
  return current
}

function resolveContainer(root: unknown, path: ReportPath, operation: ReportOperation): Container {
  let current = root
  for (const segment of path) {
    const next = child(current, segment)
    if (!next.found)
      throw new ReportOperationError('path-not-found', operation)
    current = next.value
  }
  if (!isRecord(current) && !Array.isArray(current))
    throw new ReportOperationError('path-not-found', operation)
  return current
}

/** 沿路径复制容器，把路径处的容器换成 replace 的结果。 */
function replaceAt(root: unknown, path: ReportPath, replace: (container: Container) => Container): unknown {
  if (path.length === 0)
    return replace(root as Container)
  const [segment, ...rest] = path
  if (Array.isArray(root)) {
    const index = indexIn(root, segment!)
    const copy = root.slice()
    copy[index] = replaceAt(root[index], rest, replace)
    return copy
  }
  const record = root as Readonly<Record<string, unknown>>
  return { ...record, [segment as string]: replaceAt(record[segment as string], rest, replace) }
}

function checkUniqueKey(array: readonly unknown[], value: unknown, except: number, operation: ReportOperation): void {
  const key = itemKey(value)
  if (key !== undefined && array.some((item, i) => i !== except && itemKey(item) === key))
    throw new ReportOperationError('duplicate-key', operation)
}

/** 数组项在操作之后的路径段：原来写键的改写成现在的键，原来写下标的写现在的下标。 */
function itemSegment(original: string | number, item: unknown, index: number): string | number {
  if (typeof original === 'number')
    return index
  return itemKey(item) ?? index
}

function unchanged(document: ReportDocument): ReportOperationResult {
  return { document, inverse: [] }
}

function applySet(document: ReportDocument, operation: Extract<ReportOperation, { type: 'set' }>): ReportOperationResult {
  const { path, value } = operation
  if (path.length === 0) {
    if (!isRecord(value))
      throw new ReportOperationError('invalid-value', operation)
    if (jsonEqual(document, value))
      return unchanged(document)
    return { document: value as unknown as ReportDocument, inverse: [{ type: 'set', path: [], value: document as unknown as JsonValue }] }
  }
  const parentPath = path.slice(0, -1)
  const last = path[path.length - 1]!
  const parent = resolveContainer(document, parentPath, operation)
  if (Array.isArray(parent)) {
    const index = indexIn(parent, last)
    if (index < 0)
      throw new ReportOperationError('path-not-found', operation)
    const old = parent[index]
    if (jsonEqual(old, value))
      return unchanged(document)
    checkUniqueKey(parent, value, index, operation)
    const next = replaceAt(document, parentPath, (container) => {
      const copy = (container as readonly unknown[]).slice()
      copy[index] = value
      return copy
    }) as ReportDocument
    return { document: next, inverse: [{ type: 'set', path: [...parentPath, itemSegment(last, value, index)], value: old as JsonValue }] }
  }
  if (typeof last !== 'string')
    throw new ReportOperationError('path-not-found', operation)
  const record = parent as Readonly<Record<string, unknown>>
  const existed = Object.hasOwn(record, last)
  const old = record[last]
  if (existed && jsonEqual(old, value))
    return unchanged(document)

  let inversePath: ReportPath = path
  const itemPath = parentPath.slice(0, -1)
  const owner = itemPath.length === parentPath.length ? undefined : resolveContainer(document, itemPath, operation)
  if (Array.isArray(owner) && itemKey(record) !== undefined && (last === 'id' || (last === 'name' && typeof record.id !== 'string'))) {
    const index = indexIn(owner, parentPath[parentPath.length - 1]!)
    const renamed = { ...record, [last]: value }
    checkUniqueKey(owner, renamed, index, operation)
    inversePath = [...itemPath, itemSegment(parentPath[parentPath.length - 1]!, renamed, index), last]
  }
  const next = replaceAt(document, parentPath, container => ({ ...(container as Readonly<Record<string, unknown>>), [last]: value })) as ReportDocument
  return {
    document: next,
    inverse: [existed ? { type: 'set', path: inversePath, value: old as JsonValue } : { type: 'remove', path: inversePath }],
  }
}

function applyInsert(document: ReportDocument, operation: Extract<ReportOperation, { type: 'insert' }>): ReportOperationResult {
  const { path, value } = operation
  const array = resolveContainer(document, path, operation)
  if (!Array.isArray(array))
    throw new ReportOperationError('not-an-array', operation)
  const index = operation.index ?? array.length
  if (!Number.isInteger(index) || index < 0 || index > array.length)
    throw new ReportOperationError('index-out-of-range', operation)
  checkUniqueKey(array, value, -1, operation)
  const next = replaceAt(document, path, (container) => {
    const copy = (container as readonly unknown[]).slice()
    copy.splice(index, 0, value)
    return copy
  }) as ReportDocument
  return { document: next, inverse: [{ type: 'remove', path: [...path, itemKey(value) ?? index] }] }
}

function applyRemove(document: ReportDocument, operation: Extract<ReportOperation, { type: 'remove' }>): ReportOperationResult {
  const { path } = operation
  if (path.length === 0)
    throw new ReportOperationError('invalid-path', operation)
  const parentPath = path.slice(0, -1)
  const last = path[path.length - 1]!
  const parent = resolveContainer(document, parentPath, operation)
  if (Array.isArray(parent)) {
    const index = indexIn(parent, last)
    if (index < 0)
      throw new ReportOperationError('path-not-found', operation)
    const next = replaceAt(document, parentPath, container => (container as readonly unknown[]).filter((_, i) => i !== index)) as ReportDocument
    return { document: next, inverse: [{ type: 'insert', path: parentPath, index, value: parent[index] as JsonValue }] }
  }
  if (typeof last !== 'string' || !Object.hasOwn(parent, last))
    throw new ReportOperationError('path-not-found', operation)
  const next = replaceAt(document, parentPath, (container) => {
    const copy = { ...(container as Readonly<Record<string, unknown>>) }
    delete copy[last]
    return copy
  }) as ReportDocument
  return { document: next, inverse: [{ type: 'set', path, value: (parent as Readonly<Record<string, unknown>>)[last] as JsonValue }] }
}

function applyMove(document: ReportDocument, operation: Extract<ReportOperation, { type: 'move' }>): ReportOperationResult {
  const { path, index: target } = operation
  if (path.length === 0)
    throw new ReportOperationError('invalid-path', operation)
  const parentPath = path.slice(0, -1)
  const last = path[path.length - 1]!
  const parent = resolveContainer(document, parentPath, operation)
  if (!Array.isArray(parent))
    throw new ReportOperationError('not-an-array', operation)
  const index = indexIn(parent, last)
  if (index < 0)
    throw new ReportOperationError('path-not-found', operation)
  if (!Number.isInteger(target) || target < 0 || target >= parent.length)
    throw new ReportOperationError('index-out-of-range', operation)
  if (index === target)
    return unchanged(document)
  const item = parent[index]
  const next = replaceAt(document, parentPath, (container) => {
    const copy = (container as readonly unknown[]).slice()
    copy.splice(index, 1)
    copy.splice(target, 0, item)
    return copy
  }) as ReportDocument
  return { document: next, inverse: [{ type: 'move', path: [...parentPath, itemSegment(last, item, target)], index }] }
}

function checkOperation(operation: ReportOperation): void {
  if (!isRecord(operation) || !Array.isArray(operation.path) || !operation.path.every(segment => typeof segment === 'string' || (typeof segment === 'number' && Number.isInteger(segment))))
    throw new ReportOperationError('invalid-operation', operation)
  if ((operation.type === 'set' || operation.type === 'insert') && !isJson(operation.value))
    throw new ReportOperationError('invalid-value', operation)
}

/**
 * 应用一个编辑操作，返回新文档与逆操作；不修改输入文档，没有改到的部分沿用原引用。
 * 操作没有带来变化时返回同一个文档引用与空的逆操作。
 * 插入或改名使同一数组里出现重复的键时抛出 duplicate-key；操作只保证路径与键，引用完整性由 validateDocument 检查。
 */
export function applyOperation(document: ReportDocument, operation: ReportOperation): ReportOperationResult {
  checkOperation(operation)
  switch (operation.type) {
    case 'set':
      return applySet(document, operation)
    case 'insert':
      return applyInsert(document, operation)
    case 'remove':
      return applyRemove(document, operation)
    case 'move':
      return applyMove(document, operation)
    default:
      throw new ReportOperationError('invalid-operation', operation)
  }
}

/** 依次应用一组操作；逆操作为各操作的逆操作按反序拼接。任一操作失败时抛出，输入文档保持不变。 */
export function applyOperations(document: ReportDocument, operations: readonly ReportOperation[]): ReportOperationResult {
  let current = document
  const inverses: (readonly ReportOperation[])[] = []
  for (const operation of operations) {
    const result = applyOperation(current, operation)
    current = result.document
    inverses.push(result.inverse)
  }
  return { document: current, inverse: inverses.reverse().flat() }
}
