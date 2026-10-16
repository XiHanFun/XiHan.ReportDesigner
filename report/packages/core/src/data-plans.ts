/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 数据集、字段与报表参数的计划函数：删除时把别处对它的引用一并删掉并报出删了几处，改名时连同公式里的引用一起改。

import type { ReportOperation } from './operations'
import type { DashboardCard, DataView, FilterGroup, FilterNode, Operand, ReportDocument, ReportQuery } from './schema'
import { fieldFormulaSites, renameFormulas, viewFormulaSites } from './formula-sites'
import { planRemoveItem } from './item-plans'
import { applyOperations } from './operations'

/** 删除时一并删掉的别处：列表项、筛选条件、明细排序、联动目标（目标删空时连同联动）与参数绑定。 */
export interface DataCascade {
  readonly items: number
  readonly conditions: number
  readonly sorts: number
  readonly links: number
  readonly bindings: number
}

/** 删除计划：操作合为一步撤销，cascade 是一并删掉的别处的数目。 */
export interface DataRemoval {
  readonly operations: ReportOperation[]
  readonly cascade: DataCascade
}

/** 取数的对象：报表主体或表格卡片的视图，或图表与指标卡片（带查询）。 */
type Owner
  = | { readonly card?: string, readonly dataset: string, readonly view: DataView }
    | { readonly card: string, readonly dataset: string, readonly query: ReportQuery, readonly source: Exclude<DashboardCard, { kind: 'table' }> }

function owners(document: ReportDocument): Owner[] {
  const body = document.body
  if (body.type !== 'dashboard')
    return [{ dataset: body.dataset, view: body }]
  return body.cards.map((card): Owner => card.kind === 'table'
    ? { card: card.id, dataset: card.view.dataset, view: card.view }
    : { card: card.id, dataset: card.dataset, query: card.query, source: card })
}

/** 对象上的修改：视图写 updateView，图表与指标卡片写 updateCard（路径带上 query 前缀由调用方给）。 */
function ownerUpdate(owner: Owner, path: readonly (string | number)[], value: unknown): ReportOperation {
  const change = value === undefined ? { path } : { path, value: value as never }
  if ('view' in owner)
    return owner.card === undefined ? { type: 'updateView', changes: [change] } : { type: 'updateView', card: owner.card, changes: [change] }
  return { type: 'updateCard', id: owner.card, changes: [change] }
}

function isParameterRef(value: Operand | undefined, name: string): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as { parameter?: unknown }).parameter === name
}

/** 按条件过滤筛选树：drop 为真的条件去掉，去空的子组一并去掉；返回新树与去掉的条件数，没有变化时 changed 为 false。 */
function pruneFilter(group: FilterGroup, drop: (condition: Extract<FilterNode, { field: string }>) => boolean): { group: FilterGroup, removed: number, changed: boolean } {
  let removed = 0
  let changed = false
  const conditions: FilterNode[] = []
  for (const node of group.conditions) {
    if ('conditions' in node) {
      const inner = pruneFilter(node, drop)
      removed += inner.removed
      changed ||= inner.changed
      if (inner.group.conditions.length > 0)
        conditions.push({ ...node, conditions: inner.group.conditions })
      else
        changed = true
    }
    else if (drop(node)) {
      removed += 1
      changed = true
    }
    else {
      conditions.push(node)
    }
  }
  return { group: { ...group, conditions }, removed, changed }
}

/** 筛选树里的操作数换一个：map 返回 undefined 表示不变。 */
function mapOperands(group: FilterGroup, map: (value: Operand | undefined) => Operand | undefined): { group: FilterGroup, changed: boolean } {
  let changed = false
  const conditions = group.conditions.map((node): FilterNode => {
    if ('conditions' in node) {
      const inner = mapOperands(node, map)
      changed ||= inner.changed
      return inner.changed ? { ...node, conditions: inner.group.conditions } : node
    }
    const next = map(node.value)
    if (next === undefined)
      return node
    changed = true
    return { ...node, value: next }
  })
  return { group: changed ? { ...group, conditions } : group, changed }
}

/** 对象的筛选树与它的路径。 */
function filterOf(owner: Owner): { readonly filter: FilterGroup | undefined, readonly path: readonly string[] } {
  return 'view' in owner ? { filter: owner.view.filter, path: ['filter'] } : { filter: owner.query.filter, path: ['query', 'filter'] }
}

/** 对象的参数绑定与它的路径。 */
function bindingsOf(owner: Owner): { readonly bindings: Readonly<Record<string, Operand>> | undefined, readonly path: readonly string[] } {
  return 'view' in owner ? { bindings: owner.view.parameters, path: ['parameters'] } : { bindings: owner.source.parameters, path: ['parameters'] }
}

/** 列表项里取这个字段的：对象的列表名与项 id。 */
function fieldItems(owner: Owner, field: string): { readonly list: 'columns' | 'groups' | 'rows' | 'measures' | 'dimensions', readonly id: string }[] {
  const pick = <L extends 'columns' | 'groups' | 'rows' | 'measures' | 'dimensions'>(list: L, items: readonly { readonly id: string, readonly field?: string }[]): { list: L, id: string }[] =>
    items.filter(item => item.field === field).map(item => ({ list, id: item.id }))
  if (!('view' in owner))
    return [...pick('dimensions', owner.query.dimensions), ...pick('measures', owner.query.measures)]
  const view = owner.view
  switch (view.type) {
    case 'table':
      return pick('columns', view.columns)
    case 'group':
      return [...pick('groups', view.groups), ...pick('columns', view.columns)]
    case 'crosstab':
      return [...pick('rows', view.rows), ...pick('columns', view.columns), ...pick('measures', view.measures)]
  }
}

/**
 * 删除字段：取这个字段的列表项走 planRemoveItem 一并删掉（连带它们的引用），绑定这个数据集的对象里
 * 以它为字段的筛选条件、明细排序与联动目标也删掉（目标删空的联动整条删掉），最后 removeField。
 * 计算字段公式里写到的名字不改（交给校验报出）。数据集或字段不存在时抛 RangeError。
 */
export function planRemoveField(document: ReportDocument, dataset: string, name: string): DataRemoval {
  const schema = document.datasets.find(item => item.id === dataset)
  if (!schema || !schema.fields.some(field => field.name === name))
    throw new RangeError(`[report] unknown field ${dataset}.${name}`)
  const operations: ReportOperation[] = []
  let current = document
  const run = (next: readonly ReportOperation[]): void => {
    if (next.length === 0)
      return
    operations.push(...next)
    current = applyOperations(current, next).document
  }
  let items = 0
  for (const owner of owners(document).filter(item => item.dataset === dataset)) {
    for (const item of fieldItems(owner, name)) {
      run(planRemoveItem(current, owner.card === undefined ? {} : { card: owner.card }, item.list, item.id))
      items += 1
    }
  }
  let conditions = 0
  let sorts = 0
  for (const owner of owners(current).filter(item => item.dataset === dataset)) {
    const { filter, path } = filterOf(owner)
    if (filter) {
      const pruned = pruneFilter(filter, condition => condition.field === name)
      if (pruned.changed) {
        conditions += pruned.removed
        run([ownerUpdate(owner, path, pruned.group.conditions.length === 0 ? undefined : pruned.group)])
      }
    }
    if ('view' in owner && owner.view.type !== 'crosstab' && owner.view.sort) {
      const kept = owner.view.sort.filter(rule => rule.field !== name)
      if (kept.length !== owner.view.sort.length) {
        sorts += owner.view.sort.length - kept.length
        run([ownerUpdate(owner, ['sort'], kept.length === 0 ? undefined : kept)])
      }
    }
  }
  let links = 0
  const body = current.body
  if (body.type === 'dashboard') {
    const bound = new Set(owners(current).filter(item => item.dataset === dataset).map(item => item.card))
    for (const link of body.links ?? []) {
      const kept = link.targets.filter(target => !(bound.has(target.card) && target.field === name))
      if (kept.length === link.targets.length)
        continue
      links += link.targets.length - kept.length
      run([kept.length === 0 ? { type: 'removeLink', id: link.id } : { type: 'updateLink', id: link.id, changes: [{ path: ['targets'], value: kept as never }] }])
    }
  }
  run([{ type: 'removeField', dataset, name }])
  return { operations, cascade: { items, conditions, sorts, links, bindings: 0 } }
}

/**
 * 删除报表参数：以它为操作数的筛选条件与引用它的参数绑定一并删掉，最后 removeParameter。
 * 公式里写到的 $名字 不改（交给校验报出）。参数不存在时抛 RangeError。
 */
export function planRemoveParameter(document: ReportDocument, name: string): DataRemoval {
  if (!document.parameters?.some(parameter => parameter.name === name))
    throw new RangeError(`[report] unknown parameter ${name}`)
  const operations: ReportOperation[] = []
  let conditions = 0
  let bindings = 0
  for (const owner of owners(document)) {
    const { filter, path } = filterOf(owner)
    if (filter) {
      const pruned = pruneFilter(filter, condition => isParameterRef(condition.value, name))
      if (pruned.changed) {
        conditions += pruned.removed
        operations.push(ownerUpdate(owner, path, pruned.group.conditions.length === 0 ? undefined : pruned.group))
      }
    }
    const binding = bindingsOf(owner)
    if (binding.bindings) {
      const kept = Object.entries(binding.bindings).filter(([, operand]) => !isParameterRef(operand, name))
      if (kept.length !== Object.keys(binding.bindings).length) {
        bindings += Object.keys(binding.bindings).length - kept.length
        operations.push(ownerUpdate(owner, binding.path, kept.length === 0 ? undefined : Object.fromEntries(kept)))
      }
    }
  }
  operations.push({ type: 'removeParameter', name })
  return { operations, cascade: { items: 0, conditions, sorts: 0, links: 0, bindings } }
}

/** 使用这个数据集的卡片与视图的数目。 */
export function datasetUsage(document: ReportDocument, id: string): number {
  return owners(document).filter(owner => owner.dataset === id).length
}

/** 删除数据集；还有卡片或视图使用它时抛 RangeError，数据集不存在时也抛 RangeError。 */
export function planRemoveDataset(document: ReportDocument, id: string): ReportOperation[] {
  if (!document.datasets.some(dataset => dataset.id === id))
    throw new RangeError(`[report] unknown dataset ${id}`)
  if (datasetUsage(document, id) > 0)
    throw new RangeError(`[report] dataset ${id} is still used`)
  return [{ type: 'removeDataset', id }]
}

/**
 * 报表参数改名：updateParameter，并把引用它的地方一起改掉——筛选条件的操作数、参数绑定，
 * 以及计算字段、公式度量与列汇总公式里的 $名字。新旧名字相同时为空数组；参数不存在时抛 RangeError。
 */
export function planRenameParameter(document: ReportDocument, name: string, next: string): ReportOperation[] {
  if (name === next)
    return []
  if (!document.parameters?.some(parameter => parameter.name === name))
    throw new RangeError(`[report] unknown parameter ${name}`)
  const operations: ReportOperation[] = [{ type: 'updateParameter', name, changes: [{ path: ['name'], value: next }] }]
  const swap = (value: Operand | undefined): Operand | undefined => isParameterRef(value, name) ? { parameter: next } : undefined
  for (const owner of owners(document)) {
    const { filter, path } = filterOf(owner)
    if (filter) {
      const mapped = mapOperands(filter, swap)
      if (mapped.changed)
        operations.push(ownerUpdate(owner, path, mapped.group))
    }
    const binding = bindingsOf(owner)
    if (binding.bindings && Object.values(binding.bindings).some(operand => isParameterRef(operand, name)))
      operations.push(ownerUpdate(owner, binding.path, Object.fromEntries(Object.entries(binding.bindings).map(([key, operand]) => [key, swap(operand) ?? operand]))))
  }
  const old = `$${name}`
  const sites = [...fieldFormulaSites(document), ...viewFormulaSites(document)]
  operations.push(...renameFormulas(sites, path => path[0] === old ? [`$${next}`, ...path.slice(1)] : undefined))
  return operations
}
