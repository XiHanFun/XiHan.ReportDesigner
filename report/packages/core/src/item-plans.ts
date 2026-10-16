/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 列表项与字段的计划函数：改名、删除时把别处对它的引用一并改掉，从字段生成列表项；产出的操作合为一步撤销。

import type { JsonPath } from '@xihan-ui/core/json'
import type { ItemList, ItemOwner, PropertyChange, ReportOperation } from './operations'
import type { ChartSpec, DashboardCard, DashboardView, DataView, FilterNode, JsonValue, MetricSpec, ReportDocument, ReportQuery } from './schema'
import { nextFreeId } from '@xihan-ui/designer-kit'

/** 列表项所在的对象：报表主体或表格卡片的视图，或图表与指标卡片的查询。 */
interface ResolvedOwner {
  readonly dashboard: DashboardView | undefined
  readonly card: DashboardCard | undefined
  readonly view: DataView | undefined
  readonly query: ReportQuery | undefined
  readonly dataset: string | undefined
}

function resolveOwner(document: ReportDocument, owner: ItemOwner): ResolvedOwner {
  const body = document.body
  if (owner.card === undefined) {
    if (body.type === 'dashboard')
      throw new RangeError('[report] the report body is a dashboard, an item owner needs a card')
    return { dashboard: undefined, card: undefined, view: body, query: undefined, dataset: body.dataset }
  }
  if (body.type !== 'dashboard')
    throw new RangeError('[report] the report body is not a dashboard')
  const card = body.cards.find(item => item.id === owner.card)
  if (!card)
    throw new RangeError(`[report] unknown card ${owner.card}`)
  return card.kind === 'table'
    ? { dashboard: body, card, view: card.view, query: undefined, dataset: card.view.dataset }
    : { dashboard: body, card, view: undefined, query: card.query, dataset: card.dataset }
}

function ownerOf(card: string | undefined): ItemOwner {
  return card === undefined ? {} : { card }
}

/** 视图上的修改：报表主体或表格卡片的 updateView。 */
function viewUpdate(card: string | undefined, changes: readonly PropertyChange[]): ReportOperation[] {
  return changes.length === 0 ? [] : [{ type: 'updateView', ...ownerOf(card), changes }]
}

function cardUpdate(id: string, changes: readonly PropertyChange[]): ReportOperation[] {
  return changes.length === 0 ? [] : [{ type: 'updateCard', id, changes }]
}

/** 图表配置里一处对维度或度量的引用；role 决定删除被引用项时怎么处理。 */
interface ChartReference {
  readonly path: JsonPath
  readonly key: string
  /** required 照留（由校验报出），optional 删掉属性，series 删掉整个系列，indicator / level 从数组里去掉。 */
  readonly role: 'required' | 'optional' | 'series' | 'indicator' | 'level'
  readonly index?: number
}

function chartReferences(chart: ChartSpec): ChartReference[] {
  const refs: ChartReference[] = []
  const add = (path: JsonPath, key: unknown, role: ChartReference['role'], index?: number): void => {
    if (typeof key === 'string')
      refs.push(index === undefined ? { path, key, role } : { path, key, role, index })
  }
  switch (chart.type) {
    case 'cartesian':
      add(['splitBy'], chart.splitBy, 'optional')
      chart.series.forEach((series, i) => {
        add(['series', i, 'x'], series.x, 'series', i)
        if (Array.isArray(series.y))
          series.y.forEach((key, j) => add(['series', i, 'y', j], key, 'series', i))
        else
          add(['series', i, 'y'], series.y, 'series', i)
        if (series.mark === 'scatter') {
          add(['series', i, 'size'], series.size, 'optional')
          add(['series', i, 'color'], series.color, 'optional')
        }
      })
      break
    case 'pie':
    case 'funnel':
      add(['nameField'], chart.nameField, 'required')
      add(['valueField'], chart.valueField, 'required')
      break
    case 'radar':
      add(['nameField'], chart.nameField, 'required')
      chart.indicators.forEach((indicator, i) => add(['indicators', i, 'key'], indicator.key, 'indicator', i))
      break
    case 'sankey':
      add(['sourceField'], chart.sourceField, 'required')
      add(['targetField'], chart.targetField, 'required')
      add(['valueField'], chart.valueField, 'required')
      break
    case 'heatmap':
      add(['valueField'], chart.valueField, 'required')
      if (chart.variant === 'matrix') {
        add(['rowField'], chart.rowField, 'required')
        add(['columnField'], chart.columnField, 'required')
      }
      else {
        add(['dateField'], chart.dateField, 'required')
      }
      break
    case 'hierarchy':
      chart.levels.forEach((level, i) => add(['levels', i], level, 'level', i))
      add(['valueField'], chart.valueField, 'required')
      break
  }
  return refs
}

function metricReferences(metric: MetricSpec): ChartReference[] {
  const refs: ChartReference[] = [{ path: ['value'], key: metric.value, role: 'required' }]
  if (metric.baseline !== undefined)
    refs.push({ path: ['baseline'], key: metric.baseline, role: 'optional' })
  if (metric.sparkline) {
    refs.push({ path: ['sparkline', 'x'], key: metric.sparkline.x, role: 'series' })
    refs.push({ path: ['sparkline', 'y'], key: metric.sparkline.y, role: 'series' })
  }
  return refs
}

function prefixed(prefix: JsonPath, path: JsonPath): JsonPath {
  return [...prefix, ...path]
}

/** 维度排序（AxisSort.by）里对 key 的引用：list 下各项的 sort.by。 */
function sortByChanges(items: readonly { readonly sort?: { readonly by?: string } }[] | undefined, list: string, key: string, next: string | undefined): PropertyChange[] {
  const changes: PropertyChange[] = []
  items?.forEach((item, i) => {
    if (item.sort?.by === key)
      changes.push(next === undefined ? { path: [list, i, 'sort', 'by'] } : { path: [list, i, 'sort', 'by'], value: next })
  })
  return changes
}

/** 以 card 为源、在 key 上发出取值的联动。 */
function linksOf(dashboard: DashboardView | undefined, card: string | undefined, key: string): string[] {
  if (!dashboard || card === undefined)
    return []
  return (dashboard.links ?? []).filter(link => link.card === card && link.dimension === key).map(link => link.id)
}

/** 各视图类型与查询里，能作联动源维度的列表。 */
function linkable(resolved: ResolvedOwner, list: ItemList): boolean {
  if (resolved.query)
    return list === 'dimensions'
  switch (resolved.view?.type) {
    case 'table':
      return list === 'columns'
    case 'group':
      return list === 'groups'
    case 'crosstab':
      return list === 'rows' || list === 'columns'
    default:
      return false
  }
}

/**
 * 列表项改 id：updateItem，并把别处对它的引用一起改掉——图表与指标配置里引用它的字段、查询排序的 key 与维度排序的 by、
 * 分组的 sort.by（列）、交叉表维度的 sort.by（度量）、直角坐标图标注的 series，以及以这张卡片为源、在它上面发出取值的联动。
 * 公式里写到的 id 不改（交给校验报出）。新旧 id 相同时为空数组；所在对象或项不存在时抛 RangeError。
 */
export function planRenameItem(document: ReportDocument, owner: ItemOwner, list: ItemList, id: string, next: string): ReportOperation[] {
  if (id === next)
    return []
  const resolved = resolveOwner(document, owner)
  const operations: ReportOperation[] = [{ type: 'updateItem', ...ownerOf(owner.card), list, id, changes: [{ path: ['id'], value: next }] }]
  const card = resolved.card
  if (list === 'series') {
    if (card?.kind === 'chart' && card.chart.type === 'cartesian') {
      const changes: PropertyChange[] = []
      card.chart.annotations?.forEach((annotation, i) => {
        if ('series' in annotation && annotation.series === id)
          changes.push({ path: ['chart', 'annotations', i, 'series'], value: next })
      })
      operations.push(...cardUpdate(card.id, changes))
    }
    return operations
  }
  if (resolved.query && card && card.kind !== 'table') {
    const refs = card.kind === 'chart' ? chartReferences(card.chart).map(ref => ({ ...ref, path: prefixed(['chart'], ref.path) })) : metricReferences(card.metric).map(ref => ({ ...ref, path: prefixed(['metric'], ref.path) }))
    const changes: PropertyChange[] = refs.filter(ref => ref.key === id).map(ref => ({ path: ref.path, value: next }))
    resolved.query.sort?.forEach((rule, i) => {
      if (rule.key === id)
        changes.push({ path: ['query', 'sort', i, 'key'], value: next })
    })
    changes.push(...sortByChanges(resolved.query.dimensions, 'dimensions', id, next).map(change => ({ ...change, path: prefixed(['query'], change.path) })))
    operations.push(...cardUpdate(card.id, changes))
  }
  const view = resolved.view
  if (view?.type === 'group' && list === 'columns')
    operations.push(...viewUpdate(owner.card, sortByChanges(view.groups, 'groups', id, next)))
  if (view?.type === 'crosstab' && list === 'measures')
    operations.push(...viewUpdate(owner.card, [...sortByChanges(view.rows, 'rows', id, next), ...sortByChanges(view.columns, 'columns', id, next)]))
  if (linkable(resolved, list)) {
    for (const link of linksOf(resolved.dashboard, owner.card, id))
      operations.push({ type: 'updateLink', id: link, changes: [{ path: ['dimension'], value: next }] })
  }
  return operations
}

/**
 * 删除列表项，并清理对它的引用：以这张卡片为源、在它上面发出取值的联动删除；引用它的直角坐标系列删除，
 * 雷达指标与层级从数组里去掉，可选的引用（splitBy、气泡大小与颜色、指标基准值）删掉属性，引用它的迷你图删掉；
 * 查询排序的规则与各处的 sort.by 去掉，标注里指向被删系列的去掉。图表必填的引用（如饼图的 nameField）照留，由校验报出。
 * 所在对象或项不存在时抛 RangeError。
 */
export function planRemoveItem(document: ReportDocument, owner: ItemOwner, list: ItemList, id: string): ReportOperation[] {
  const resolved = resolveOwner(document, owner)
  const operations: ReportOperation[] = []
  const card = resolved.card
  if (linkable(resolved, list)) {
    for (const link of linksOf(resolved.dashboard, owner.card, id))
      operations.push({ type: 'removeLink', id: link })
  }
  if (list === 'series') {
    if (card?.kind === 'chart' && card.chart.type === 'cartesian' && card.chart.annotations) {
      const kept = card.chart.annotations.filter(annotation => !('series' in annotation && annotation.series === id))
      if (kept.length !== card.chart.annotations.length)
        operations.push(...cardUpdate(card.id, [kept.length === 0 ? { path: ['chart', 'annotations'] } : { path: ['chart', 'annotations'], value: kept as unknown as JsonValue }]))
    }
  }
  else if (resolved.query && card && card.kind !== 'table') {
    const changes: PropertyChange[] = []
    const removedSeries = new Set<string>()
    if (card.kind === 'chart') {
      const chart = card.chart
      for (const ref of chartReferences(chart).filter(item => item.key === id)) {
        if (ref.role === 'optional')
          changes.push({ path: prefixed(['chart'], ref.path) })
        else if (ref.role === 'series' && chart.type === 'cartesian')
          removedSeries.add(chart.series[ref.index!]!.id)
      }
      if (chart.type === 'radar' && chart.indicators.some(indicator => indicator.key === id))
        changes.push({ path: ['chart', 'indicators'], value: chart.indicators.filter(indicator => indicator.key !== id) as unknown as JsonValue })
      if (chart.type === 'hierarchy' && chart.levels.includes(id))
        changes.push({ path: ['chart', 'levels'], value: chart.levels.filter(level => level !== id) })
    }
    else {
      const metric = card.metric
      if (metric.baseline === id)
        changes.push({ path: ['metric', 'baseline'] })
      if (metric.sparkline && (metric.sparkline.x === id || metric.sparkline.y === id))
        changes.push({ path: ['metric', 'sparkline'] })
    }
    const sort = resolved.query.sort
    if (sort?.some(rule => rule.key === id)) {
      const kept = sort.filter(rule => rule.key !== id)
      changes.push(kept.length === 0 ? { path: ['query', 'sort'] } : { path: ['query', 'sort'], value: kept as unknown as JsonValue })
    }
    changes.push(...sortByChanges(resolved.query.dimensions, 'dimensions', id, undefined).map(change => ({ ...change, path: prefixed(['query'], change.path) })))
    const chart = card.kind === 'chart' ? card.chart : undefined
    if (chart?.type === 'cartesian' && removedSeries.size > 0 && chart.annotations) {
      const kept = chart.annotations.filter(annotation => !('series' in annotation && removedSeries.has(annotation.series)))
      if (kept.length !== chart.annotations.length)
        changes.push(kept.length === 0 ? { path: ['chart', 'annotations'] } : { path: ['chart', 'annotations'], value: kept as unknown as JsonValue })
    }
    operations.push(...cardUpdate(card.id, changes))
    for (const series of removedSeries)
      operations.push({ type: 'removeItem', card: card.id, list: 'series', id: series })
  }
  const view = resolved.view
  if (view?.type === 'group' && list === 'columns')
    operations.push(...viewUpdate(owner.card, sortByChanges(view.groups, 'groups', id, undefined)))
  if (view?.type === 'crosstab' && list === 'measures')
    operations.push(...viewUpdate(owner.card, [...sortByChanges(view.rows, 'rows', id, undefined), ...sortByChanges(view.columns, 'columns', id, undefined)]))
  operations.push({ type: 'removeItem', ...ownerOf(owner.card), list, id })
  return operations
}

/** 筛选树里引用 name 的条件，路径相对筛选树。 */
function filterFieldPaths(nodes: readonly FilterNode[] | undefined, name: string, base: JsonPath): JsonPath[] {
  const paths: JsonPath[] = []
  nodes?.forEach((node, i) => {
    if ('conditions' in node)
      paths.push(...filterFieldPaths(node.conditions, name, [...base, 'conditions', i]))
    else if (node.field === name)
      paths.push([...base, 'conditions', i, 'field'])
  })
  return paths
}

/** 视图里引用字段 name 的各处路径（相对视图）。 */
function viewFieldPaths(view: DataView, name: string): JsonPath[] {
  const paths: JsonPath[] = []
  const lists: Record<string, readonly object[]> = view.type === 'crosstab'
    ? { rows: view.rows, columns: view.columns, measures: view.measures }
    : view.type === 'group'
      ? { groups: view.groups, columns: view.columns }
      : { columns: view.columns }
  for (const [list, items] of Object.entries(lists)) {
    items.forEach((item, i) => {
      if ((item as { readonly field?: unknown }).field === name)
        paths.push([list, i, 'field'])
    })
  }
  if (view.filter)
    paths.push(...filterFieldPaths(view.filter.conditions, name, ['filter']))
  if (view.type !== 'crosstab') {
    view.sort?.forEach((rule, i) => {
      if (rule.field === name)
        paths.push(['sort', i, 'field'])
    })
  }
  return paths
}

/** 查询里引用字段 name 的各处路径（相对卡片）。 */
function queryFieldPaths(query: ReportQuery, name: string): JsonPath[] {
  const paths: JsonPath[] = []
  query.dimensions.forEach((dimension, i) => {
    if (dimension.field === name)
      paths.push(['query', 'dimensions', i, 'field'])
  })
  query.measures.forEach((measure, i) => {
    if ('field' in measure && measure.field === name)
      paths.push(['query', 'measures', i, 'field'])
  })
  if (query.filter)
    paths.push(...filterFieldPaths(query.filter.conditions, name, ['query', 'filter']))
  return paths
}

/**
 * 字段改名：updateField，并把绑定这个数据集的视图与查询里引用它的地方一起改掉——列、分组、维度与度量的 field，
 * 筛选条件与明细排序的 field，以及目标卡片绑定这个数据集的联动目标的 field。计算字段与公式里写到的名字不改（交给校验报出）。
 * 新旧名字相同时为空数组；数据集或字段不存在时抛 RangeError。
 */
export function planRenameField(document: ReportDocument, dataset: string, name: string, next: string): ReportOperation[] {
  if (name === next)
    return []
  const schema = document.datasets.find(item => item.id === dataset)
  if (!schema || !schema.fields.some(field => field.name === name))
    throw new RangeError(`[report] unknown field ${dataset}.${name}`)
  const operations: ReportOperation[] = [{ type: 'updateField', dataset, name, changes: [{ path: ['name'], value: next }] }]
  const rename = (paths: readonly JsonPath[]): PropertyChange[] => paths.map(path => ({ path, value: next }))
  const body = document.body
  if (body.type !== 'dashboard') {
    if (body.dataset === dataset)
      operations.push(...viewUpdate(undefined, rename(viewFieldPaths(body, name))))
    return operations
  }
  const bound = new Set<string>()
  for (const card of body.cards) {
    if (card.kind === 'table') {
      if (card.view.dataset !== dataset)
        continue
      bound.add(card.id)
      operations.push(...viewUpdate(card.id, rename(viewFieldPaths(card.view, name))))
    }
    else if (card.dataset === dataset) {
      bound.add(card.id)
      operations.push(...cardUpdate(card.id, rename(queryFieldPaths(card.query, name))))
    }
  }
  for (const link of body.links ?? []) {
    const changes: PropertyChange[] = []
    link.targets.forEach((target, i) => {
      if (bound.has(target.card) && target.field === name)
        changes.push({ path: ['targets', i, 'field'], value: next })
    })
    if (changes.length > 0)
      operations.push({ type: 'updateLink', id: link.id, changes })
  }
  return operations
}

/** 所在对象里已有的列表项 id（维度、度量、列与分组共用一套命名）。 */
function takenIds(resolved: ResolvedOwner): Set<string> {
  const ids = new Set<string>()
  const collect = (items: readonly { readonly id: string }[] | undefined): void => {
    for (const item of items ?? [])
      ids.add(item.id)
  }
  if (resolved.query) {
    collect(resolved.query.dimensions)
    collect(resolved.query.measures)
  }
  const view = resolved.view
  if (view?.type === 'crosstab') {
    collect(view.rows)
    collect(view.columns)
    collect(view.measures)
  }
  else if (view) {
    collect(view.columns)
    if (view.type === 'group')
      collect(view.groups)
  }
  return ids
}

/**
 * 从数据集字段生成一个列表项并加进列表：维度（查询的 dimensions、交叉表的 rows / columns、分组报表的 groups）取这个字段，
 * 日期字段缺省按月分桶；度量里数值字段缺省 sum，其余缺省 count；明细表与分组报表的列只取字段。
 * id 缺省取字段名，已被占用时用 nextFreeId 接着编。字段不存在、列表不能放字段（series）或所在对象不存在时抛 RangeError。
 */
export function planAddFieldItem(document: ReportDocument, owner: ItemOwner, list: ItemList, field: string, options: { readonly index?: number, readonly id?: string } = {}): ReportOperation[] {
  const resolved = resolveOwner(document, owner)
  const definition = document.datasets.find(item => item.id === resolved.dataset)?.fields.find(item => item.name === field)
  if (!definition)
    throw new RangeError(`[report] unknown field ${resolved.dataset}.${field}`)
  if (list === 'series')
    throw new RangeError('[report] series are not built from a field')
  const taken = takenIds(resolved)
  const id = options.id ?? (taken.has(field) ? nextFreeId(field, taken) : field)
  const dated = definition.type === 'date' || definition.type === 'datetime'
  const isColumn = list === 'columns' && resolved.view !== undefined && resolved.view.type !== 'crosstab'
  let item: JsonValue
  if (list === 'measures')
    item = { id, field, aggregate: definition.type === 'number' ? 'sum' : 'count' }
  else if (isColumn)
    item = { id, field }
  else
    item = dated ? { id, field, bucket: 'month' } : { id, field }
  return [{ type: 'addItem', ...ownerOf(owner.card), list, item, ...(options.index === undefined ? {} : { index: options.index }) }]
}
