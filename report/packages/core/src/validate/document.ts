/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表文档的自校验：结构、取值范围与引用关系，只给出问题码、定位与参数。

import type { JsonPath, JsonObject as JsonRecord, JsonValue } from '@xihan-ui/core/json'
import type { SchemaIssue, SchemaIssueTarget } from '@xihan-ui/designer-kit/schema'
import type { ExpressionEngine } from '../expression'
import type { ReportCoreExtension, ReportKindEntry, ReportModel, ReportPropertyTarget } from '../extensions'
import type { ReportPropertyDescriptor } from '../properties'
import type { DateBucket, FieldType, ReportDocument } from '../schema'
import type { JsonObject, KeyedItem, ValidationIssue } from './checker'
import type { FormulaSite } from './common'
import { isPlainObject } from '@xihan-ui/core/json'
import { checkExtensionData, extensionIssuePrefix, runExtensionRules } from '@xihan-ui/designer-kit'
import { checkProperties, findPropertyValueIssue } from '@xihan-ui/designer-kit/properties'
import { withSeverity } from '@xihan-ui/designer-kit/schema'
import { createReportModel } from '../extensions'
import { itemKey } from '../operations'
import { AGGREGATE_KINDS, COLUMN_ALIGNS, COLUMN_STICKY_SIDES, DATE_BUCKETS, FIELD_TYPES, FILTER_LOGICS, FILTER_OPERATORS, MEASURES_ON, REPORT_SCHEMA_VERSION } from '../schema'
import { checkChart, checkMetric } from './chart'
import { Checker } from './checker'
import { checkAxisSort, checkFormat, checkFormulas, checkSortOrder, isParameterRef, isScalar, literalMatches, typeCompatible } from './common'

/** 校验选项。 */
export interface ValidateOptions {
  /** 表达式引擎：提供时检查公式能否编译、引用是否存在、有没有循环引用。 */
  readonly expressionEngine?: ExpressionEngine
  /** 卡片与视图种类、追加属性与规则的扩展；内置扩展总在最前。 */
  readonly extensions?: readonly ReportCoreExtension[]
}

interface DatasetInfo {
  readonly fields: ReadonlyMap<string, FieldType>
  readonly parameters: ReadonlyMap<string, { readonly type: FieldType, readonly required: boolean, readonly multiple: boolean }>
}

interface ParameterInfo {
  readonly type: FieldType
  readonly multiple: boolean
}

interface Scope {
  readonly c: Checker
  readonly model: ReportModel
  readonly datasets: ReadonlyMap<string, DatasetInfo>
  readonly parameters: ReadonlyMap<string, ParameterInfo>
  readonly expressionEngine: ExpressionEngine | undefined
  /** 公式里可引用的报表参数变量：$名字。 */
  readonly variables: ReadonlySet<string>
}

/** 视图或卡片上可发出联动取值的维度。 */
interface ViewInfo {
  readonly dataset: DatasetInfo | undefined
  readonly dimensions: ReadonlyMap<string, DateBucket | undefined>
}

const STRING_OPERATORS = new Set(['contains', 'notContains', 'startsWith', 'endsWith'])
const ORDER_OPERATORS = new Set(['gt', 'gte', 'lt', 'lte', 'between'])
const DATE_TYPES: readonly FieldType[] = ['date', 'datetime']

/** 以 $ 开头的名字留给公式里的报表参数。 */
function checkReserved(scope: { readonly c: Checker }, key: string | undefined, path: JsonPath, keyName: 'id' | 'name'): void {
  if (key?.startsWith('$'))
    scope.c.report('reserved-name', [...path, keyName], { key })
}

function withVariables(keys: ReadonlySet<string>, variables: ReadonlySet<string>): Set<string> {
  return new Set([...keys, ...variables])
}

function checkField(scope: Scope, owner: JsonObject, key: string, path: JsonPath, dataset: DatasetInfo | undefined, required = true): { name: string, type: FieldType | undefined } | undefined {
  const name = scope.c.string(owner, key, path, required)
  if (name === undefined)
    return undefined
  const type = dataset?.fields.get(name)
  if (dataset && type === undefined)
    scope.c.report('unknown-field', [...path, key], { field: name })
  return { name, type }
}

function checkBucket(scope: Scope, owner: JsonObject, path: JsonPath, type: FieldType | undefined): DateBucket | undefined {
  const bucket = scope.c.oneOf(owner, 'bucket', path, DATE_BUCKETS)
  if (bucket !== undefined && type !== undefined && !DATE_TYPES.includes(type))
    scope.c.report('bucket-type-mismatch', [...path, 'bucket'], { type })
  return bucket
}

function checkParameterRef(scope: Scope, value: { readonly parameter: unknown }, path: JsonPath): ParameterInfo | undefined {
  if (typeof value.parameter !== 'string') {
    scope.c.report('invalid-type', [...path, 'parameter'], { expected: 'string' })
    return undefined
  }
  const info = scope.parameters.get(value.parameter)
  if (!info)
    scope.c.report('unknown-parameter', [...path, 'parameter'], { parameter: value.parameter })
  return info
}

function checkLiteral(scope: Scope, value: unknown, path: JsonPath, expected: FieldType | undefined): void {
  if (!isScalar(value)) {
    scope.c.report('invalid-type', path, { expected: 'string|number|boolean|null' })
    return
  }
  if (value !== null && expected !== undefined && !literalMatches(value, expected))
    scope.c.report('operand-type-mismatch', path, { expected })
}

/** 校验绑定给数据集参数的操作数。 */
function checkBindingValue(scope: Scope, value: unknown, path: JsonPath, target: { readonly type: FieldType, readonly multiple: boolean } | undefined): void {
  if (isParameterRef(value)) {
    const info = checkParameterRef(scope, value, path)
    if (info && target) {
      if (!typeCompatible(info.type, target.type))
        scope.c.report('operand-type-mismatch', path, { expected: target.type })
      if (info.multiple && !target.multiple)
        scope.c.report('operand-shape', path)
    }
    return
  }
  if (Array.isArray(value)) {
    if (target && !target.multiple)
      scope.c.report('operand-shape', path)
    value.forEach((item, index) => checkLiteral(scope, item, [...path, index], target?.type))
    return
  }
  if (value === null) {
    scope.c.report('operand-required', path)
    return
  }
  checkLiteral(scope, value, path, target?.type)
}

/** 校验视图或卡片的数据集与参数绑定。 */
function checkBinding(scope: Scope, owner: JsonObject, path: JsonPath): DatasetInfo | undefined {
  const { c } = scope
  const id = c.string(owner, 'dataset', path, true)
  const dataset = id === undefined ? undefined : scope.datasets.get(id)
  if (id !== undefined && !dataset)
    c.report('unknown-dataset', [...path, 'dataset'], { dataset: id })
  const bindings = c.objectAt(owner, 'parameters', path)
  for (const [name, value] of Object.entries(bindings ?? {})) {
    const target = dataset?.parameters.get(name)
    if (dataset && !target)
      c.report('unknown-dataset-parameter', [...path, 'parameters', name], { parameter: name })
    checkBindingValue(scope, value, [...path, 'parameters', name], target)
  }
  for (const [name, info] of dataset?.parameters ?? []) {
    if (info.required && !(bindings && Object.hasOwn(bindings, name)))
      c.report('required', [...path, 'parameters', name])
  }
  return dataset
}

function checkConditionValue(scope: Scope, condition: JsonObject, path: JsonPath, operator: string, valueType: FieldType | undefined): void {
  const { c } = scope
  const value = condition.value
  const at = [...path, 'value']
  if (operator === 'isEmpty' || operator === 'isNotEmpty') {
    if (value !== undefined)
      c.report('operand-shape', at, { operator })
    return
  }
  if (value === undefined || value === null) {
    c.report('operand-required', at)
    return
  }
  const many = operator === 'in' || operator === 'notIn'
  if (isParameterRef(value)) {
    const info = checkParameterRef(scope, value, at)
    if (!info)
      return
    if (operator === 'between' || (info.multiple && !many))
      c.report('operand-shape', at, { operator })
    if (valueType !== undefined && !typeCompatible(info.type, valueType))
      c.report('operand-type-mismatch', at, { expected: valueType })
    return
  }
  if (Array.isArray(value)) {
    if (operator === 'between') {
      if (value.length !== 2) {
        c.report('operand-shape', at, { operator })
        return
      }
      if (value.every(item => item === null))
        c.report('operand-required', at)
    }
    else if (!many) {
      c.report('operand-shape', at, { operator })
      return
    }
    else if (value.every(item => item === null)) {
      c.report('operand-required', at)
    }
    value.forEach((item, index) => checkLiteral(scope, item, [...at, index], valueType))
    return
  }
  if (operator === 'between') {
    c.report('operand-shape', at, { operator })
    return
  }
  checkLiteral(scope, value, at, valueType)
}

/** 校验条件组；ids 收集整棵树里的条件与子组 id。 */
function checkFilterGroup(scope: Scope, group: JsonObject, path: JsonPath, dataset: DatasetInfo | undefined, ids: Set<string>): void {
  const { c } = scope
  c.oneOf(group, 'logic', path, FILTER_LOGICS, true)
  for (const node of c.keyed(group, 'conditions', path, 'id', { required: true, scope: ids })) {
    if ('conditions' in node.item) {
      checkFilterGroup(scope, node.item, node.path, dataset, ids)
      continue
    }
    const field = checkField(scope, node.item, 'field', node.path, dataset)
    const bucket = checkBucket(scope, node.item, node.path, field?.type)
    const operator = c.oneOf(node.item, 'operator', node.path, FILTER_OPERATORS, true)
    c.boolean(node.item, 'ignoreCase', node.path)
    if (operator === undefined)
      continue
    const type = bucket === undefined ? field?.type : undefined
    if (STRING_OPERATORS.has(operator) && type !== undefined && type !== 'string')
      c.report('operator-type-mismatch', [...node.path, 'operator'], { operator, type })
    if (ORDER_OPERATORS.has(operator) && type === 'boolean')
      c.report('operator-type-mismatch', [...node.path, 'operator'], { operator, type })
    const valueType: FieldType | undefined = bucket !== undefined || STRING_OPERATORS.has(operator) ? 'string' : type
    checkConditionValue(scope, node.item, node.path, operator, valueType)
  }
}

function checkFilter(scope: Scope, owner: JsonObject, path: JsonPath, dataset: DatasetInfo | undefined): void {
  const group = scope.c.objectAt(owner, 'filter', path)
  if (group)
    checkFilterGroup(scope, group, [...path, 'filter'], dataset, new Set())
}

function checkRowSort(scope: Scope, owner: JsonObject, path: JsonPath, dataset: DatasetInfo | undefined): void {
  scope.c.array(owner, 'sort', path)?.forEach((value, index) => {
    const at = [...path, 'sort', index]
    const rule = scope.c.object(value, at)
    if (!rule)
      return
    checkField(scope, rule, 'field', at, dataset)
    checkSortOrder(scope.c, rule, at)
  })
}

/** 校验度量，返回度量 id。 */
function checkMeasures(scope: Scope, measures: readonly KeyedItem[], dataset: DatasetInfo | undefined): Set<string> {
  const { c } = scope
  const keys = new Set<string>()
  const formulas: FormulaSite[] = []
  for (const { item, path, key } of measures) {
    if (key !== undefined)
      keys.add(key)
    checkReserved(scope, key, path, 'id')
    c.string(item, 'title', path)
    checkFormat(c, item, 'format', path)
    const hasAggregate = 'aggregate' in item
    if (hasAggregate === ('formula' in item)) {
      c.report('measure-definition', path)
      continue
    }
    if (hasAggregate) {
      const aggregate = c.oneOf(item, 'aggregate', path, AGGREGATE_KINDS, true)
      const field = checkField(scope, item, 'field', path, dataset, aggregate !== undefined && aggregate !== 'count')
      if ((aggregate === 'sum' || aggregate === 'avg') && field?.type !== undefined && field.type !== 'number')
        c.report('aggregate-type-mismatch', [...path, 'aggregate'], { aggregate, type: field.type })
      continue
    }
    const formula = c.string(item, 'formula', path, true)
    if (formula !== undefined && key !== undefined)
      formulas.push({ name: key, expression: formula, path: [...path, 'formula'] })
  }
  checkFormulas(c, scope.expressionEngine, formulas, withVariables(keys, scope.variables))
  return keys
}

/** 校验维度，返回维度 id 到日期粒度。 */
function checkDimensions(scope: Scope, dimensions: readonly KeyedItem[], dataset: DatasetInfo | undefined, measures: ReadonlySet<string>): Map<string, DateBucket | undefined> {
  const result = new Map<string, DateBucket | undefined>()
  for (const { item, path, key } of dimensions) {
    const field = checkField(scope, item, 'field', path, dataset)
    const bucket = checkBucket(scope, item, path, field?.type)
    scope.c.string(item, 'title', path)
    checkFormat(scope.c, item, 'format', path)
    checkAxisSort(scope.c, item, path, measures)
    if (key !== undefined)
      result.set(key, bucket)
  }
  return result
}

/** 校验表格列，返回列 id 到字段与带汇总的列 id。 */
function checkColumns(scope: Scope, owner: JsonObject, path: JsonPath, dataset: DatasetInfo | undefined, ids: Set<string>, nonEmpty: boolean): { columns: Map<string, string>, summaries: Set<string> } {
  const { c } = scope
  const columns = new Map<string, string>()
  const summaries = new Set<string>()
  const formulas: FormulaSite[] = []
  for (const { item, path: at, key } of c.keyed(owner, 'columns', path, 'id', { required: true, nonEmpty, scope: ids })) {
    checkReserved(scope, key, at, 'id')
    const field = checkField(scope, item, 'field', at, dataset)
    if (key !== undefined && field)
      columns.set(key, field.name)
    c.string(item, 'title', at)
    checkFormat(c, item, 'format', at)
    c.number(item, 'width', at, { min: 0, exclusiveMin: true })
    c.oneOf(item, 'align', at, COLUMN_ALIGNS)
    c.oneOf(item, 'sticky', at, COLUMN_STICKY_SIDES)
    const summary = c.objectAt(item, 'summary', at)
    if (!summary)
      continue
    const sp = [...at, 'summary']
    if (key !== undefined)
      summaries.add(key)
    if (('aggregate' in summary) === ('formula' in summary)) {
      c.report('measure-definition', sp)
      continue
    }
    if ('aggregate' in summary) {
      const aggregate = c.oneOf(summary, 'aggregate', sp, AGGREGATE_KINDS, true)
      if ((aggregate === 'sum' || aggregate === 'avg') && field?.type !== undefined && field.type !== 'number')
        c.report('aggregate-type-mismatch', [...sp, 'aggregate'], { aggregate, type: field.type })
      continue
    }
    const formula = c.string(summary, 'formula', sp, true)
    if (formula !== undefined && key !== undefined)
      formulas.push({ name: key, expression: formula, path: [...sp, 'formula'] })
  }
  checkFormulas(c, scope.expressionEngine, formulas, withVariables(summaries, scope.variables))
  return { columns, summaries }
}

function fieldDimensions(columns: ReadonlyMap<string, string>): Map<string, DateBucket | undefined> {
  return new Map([...columns.keys()].map(key => [key, undefined]))
}

function checkTable(scope: Scope, view: JsonObject, path: JsonPath): ViewInfo {
  const dataset = checkBinding(scope, view, path)
  const { columns } = checkColumns(scope, view, path, dataset, new Set(), true)
  checkFilter(scope, view, path, dataset)
  checkRowSort(scope, view, path, dataset)
  scope.c.number(view, 'limit', path, { integer: true, min: 0 })
  return { dataset, dimensions: fieldDimensions(columns) }
}

function checkGroup(scope: Scope, view: JsonObject, path: JsonPath): ViewInfo {
  const { c } = scope
  const dataset = checkBinding(scope, view, path)
  const ids = new Set<string>()
  const groups = c.keyed(view, 'groups', path, 'id', { required: true, nonEmpty: true, scope: ids })
  const { summaries } = checkColumns(scope, view, path, dataset, ids, false)
  const dimensions = new Map<string, DateBucket | undefined>()
  for (const { item, path: at, key } of groups) {
    const field = checkField(scope, item, 'field', at, dataset)
    const bucket = checkBucket(scope, item, at, field?.type)
    c.string(item, 'title', at)
    checkFormat(c, item, 'format', at)
    checkAxisSort(c, item, at, summaries)
    c.boolean(item, 'header', at)
    c.boolean(item, 'subtotal', at)
    if (key !== undefined)
      dimensions.set(key, bucket)
  }
  checkFilter(scope, view, path, dataset)
  checkRowSort(scope, view, path, dataset)
  c.boolean(view, 'detail', path)
  c.boolean(view, 'grandTotal', path)
  return { dataset, dimensions }
}

function checkCrosstab(scope: Scope, view: JsonObject, path: JsonPath): ViewInfo {
  const { c } = scope
  const dataset = checkBinding(scope, view, path)
  const ids = new Set<string>()
  const rows = c.keyed(view, 'rows', path, 'id', { required: true, scope: ids })
  const columns = c.keyed(view, 'columns', path, 'id', { required: true, scope: ids })
  const measures = checkMeasures(scope, c.keyed(view, 'measures', path, 'id', { required: true, nonEmpty: true, scope: ids }), dataset)
  const dimensions = checkDimensions(scope, [...rows, ...columns], dataset, measures)
  checkFilter(scope, view, path, dataset)
  for (const key of ['rowTotals', 'columnTotals']) {
    const totals = c.objectAt(view, key, path)
    if (totals) {
      c.boolean(totals, 'subtotals', [...path, key])
      c.boolean(totals, 'grandTotal', [...path, key])
    }
  }
  c.oneOf(view, 'measuresOn', path, MEASURES_ON)
  return { dataset, dimensions }
}

function checkQuery(scope: Scope, card: JsonObject, path: JsonPath, dataset: DatasetInfo | undefined): { dimensions: Map<string, DateBucket | undefined>, measures: Set<string> } {
  const { c } = scope
  const query = c.objectAt(card, 'query', path, true)
  if (!query)
    return { dimensions: new Map(), measures: new Set() }
  const at = [...path, 'query']
  const ids = new Set<string>()
  const dimensionItems = c.keyed(query, 'dimensions', at, 'id', { required: true, scope: ids })
  const measures = checkMeasures(scope, c.keyed(query, 'measures', at, 'id', { required: true, nonEmpty: true, scope: ids }), dataset)
  const dimensions = checkDimensions(scope, dimensionItems, dataset, measures)
  checkFilter(scope, query, at, dataset)
  c.array(query, 'sort', at)?.forEach((value, index) => {
    const sp = [...at, 'sort', index]
    const rule = c.object(value, sp)
    if (!rule)
      return
    const key = c.string(rule, 'key', sp, true)
    if (key !== undefined && !dimensions.has(key) && !measures.has(key))
      c.report('unknown-key', [...sp, 'key'], { key })
    checkSortOrder(c, rule, sp)
  })
  c.number(query, 'limit', at, { integer: true, min: 0 })
  return { dimensions, measures }
}

function checkDataView(scope: Scope, view: JsonObject, path: JsonPath, types: readonly ('table' | 'group' | 'crosstab' | 'dashboard')[]): ViewInfo | undefined {
  const type = scope.c.oneOf(view, 'type', path, types, true)
  switch (type) {
    case 'table':
      return checkTable(scope, view, path)
    case 'group':
      return checkGroup(scope, view, path)
    case 'crosstab':
      return checkCrosstab(scope, view, path)
    case 'dashboard':
      checkDashboard(scope, view, path)
      return undefined
    default:
      return undefined
  }
}

const NO_KEYS = { dimensions: new Set<string>(), measures: new Set<string>() }

/** 种类自己的校验：扩展种类的问题码必须以扩展 id 的末段加点开头，否则抛 TypeError。 */
function checkKind(
  scope: Scope,
  entry: ReportKindEntry<{ readonly validate?: (object: never, check: never) => readonly SchemaIssue[] }>,
  object: JsonObject,
  path: JsonPath,
  keys: { readonly dimensions: ReadonlySet<string>, readonly measures: ReadonlySet<string> },
  dataset: DatasetInfo | undefined,
): void {
  const validate = entry.kind.validate as ((object: unknown, check: unknown) => readonly SchemaIssue[]) | undefined
  if (!validate)
    return
  const issues = validate(object, { path, dimensions: keys.dimensions, measures: keys.measures, fieldType: (name: string) => dataset?.fields.get(name) })
  if (!entry.builtin) {
    const prefix = `${extensionIssuePrefix(entry.owner)}.`
    for (const issue of issues) {
      if (!issue.code.startsWith(prefix))
        throw new TypeError(`[report] issue ${issue.code} from ${entry.name} must start with ${prefix}`)
    }
  }
  scope.c.add(issues)
}

/** 主体：按视图种类查。内置的明细表、分组报表、交叉表与看板走各自的校验，扩展视图按登记的取数形状查取数部分再交给种类。 */
function checkBody(scope: Scope, body: JsonObject, path: JsonPath): void {
  const { c } = scope
  const type = c.string(body, 'type', path, true)
  if (type === undefined)
    return
  const entry = scope.model.views.get(type)
  if (!entry) {
    c.report('unknown-kind', [...path, 'type'], { kind: type })
    return
  }
  switch (entry.kind.data) {
    case 'table':
    case 'group':
    case 'crosstab':
    case 'dashboard':
      checkDataView(scope, body, path, [entry.kind.data])
      return
    case 'query': {
      const dataset = checkBinding(scope, body, path)
      const query = checkQuery(scope, body, path, dataset)
      checkKind(scope, entry, body, path, { dimensions: new Set(query.dimensions.keys()), measures: query.measures }, dataset)
      return
    }
    case 'none':
      checkKind(scope, entry, body, path, NO_KEYS, undefined)
  }
}

/** 一个能带扩展数据或追加属性的对象：路径、追加属性的类别（没有的不查属性）、能不能带扩展数据。 */
interface ExtensibleSite {
  readonly object: unknown
  readonly path: JsonPath
  readonly target: ReportPropertyTarget | 'document' | undefined
  readonly extensible: boolean
}

function itemsAt(owner: unknown, key: string, path: JsonPath): { object: JsonObject, path: JsonPath }[] {
  if (!isPlainObject(owner) || !Array.isArray(owner[key]))
    return []
  return (owner[key] as unknown[]).flatMap((object, index) => isPlainObject(object) ? [{ object, path: [...path, key, index] }] : [])
}

function querySites(owner: JsonObject, path: JsonPath): ExtensibleSite[] {
  const query = owner.query
  if (!isPlainObject(query))
    return []
  const at = [...path, 'query']
  return [
    ...itemsAt(query, 'dimensions', at).map(item => ({ ...item, target: 'dimension' as const, extensible: true })),
    ...itemsAt(query, 'measures', at).map(item => ({ ...item, target: 'measure' as const, extensible: true })),
  ]
}

function viewSites(view: JsonObject, path: JsonPath): ExtensibleSite[] {
  const type = typeof view.type === 'string' ? view.type : undefined
  const sites: ExtensibleSite[] = [{ object: view, path, target: type === undefined ? undefined : `view:${type}`, extensible: true }]
  if (type === 'crosstab') {
    sites.push(...itemsAt(view, 'rows', path).map(item => ({ ...item, target: 'dimension' as const, extensible: true })))
    sites.push(...itemsAt(view, 'columns', path).map(item => ({ ...item, target: 'dimension' as const, extensible: true })))
    sites.push(...itemsAt(view, 'measures', path).map(item => ({ ...item, target: 'measure' as const, extensible: true })))
  }
  else {
    sites.push(...itemsAt(view, 'columns', path).map(item => ({ ...item, target: 'column' as const, extensible: true })))
    sites.push(...itemsAt(view, 'groups', path).map(item => ({ ...item, target: 'group-level' as const, extensible: true })))
  }
  return [...sites, ...querySites(view, path)]
}

/** 文档里能带扩展数据或追加属性的对象，按文档次序。 */
function extensibleSites(document: JsonObject): ExtensibleSite[] {
  const sites: ExtensibleSite[] = [{ object: document, path: [], target: 'document', extensible: true }]
  sites.push(...itemsAt(document, 'parameters', []).map(item => ({ ...item, target: 'parameter' as const, extensible: true })))
  for (const dataset of itemsAt(document, 'datasets', [])) {
    sites.push({ ...dataset, target: undefined, extensible: true })
    sites.push(...itemsAt(dataset.object, 'fields', dataset.path).map(item => ({ ...item, target: 'field' as const, extensible: true })))
    sites.push(...itemsAt(dataset.object, 'parameters', dataset.path).map(item => ({ ...item, target: undefined, extensible: true })))
  }
  const body = document.body
  if (!isPlainObject(body))
    return sites
  if (body.type !== 'dashboard')
    return [...sites, ...viewSites(body, ['body'])]
  sites.push({ object: body, path: ['body'], target: 'dashboard', extensible: true })
  for (const card of itemsAt(body, 'cards', ['body'])) {
    const kind = typeof card.object.kind === 'string' ? card.object.kind : undefined
    sites.push({ ...card, target: kind === undefined ? undefined : `card:${kind}`, extensible: true })
    const chart = card.object.chart
    if (isPlainObject(chart)) {
      const at = [...card.path, 'chart']
      sites.push({ object: chart, path: at, target: typeof chart.type === 'string' ? `chart:${chart.type}` : undefined, extensible: false })
      sites.push(...itemsAt(chart, 'series', at).map(item => ({ ...item, target: 'series' as const, extensible: false })))
    }
    if (isPlainObject(card.object.metric))
      sites.push({ object: card.object.metric, path: [...card.path, 'metric'], target: 'metric', extensible: false })
    if (isPlainObject(card.object.view))
      sites.push(...viewSites(card.object.view, [...card.path, 'view']))
    sites.push(...querySites(card.object, card.path))
  }
  for (const link of itemsAt(body, 'links', ['body'])) {
    sites.push({ ...link, target: 'link', extensible: true })
    sites.push(...itemsAt(link.object, 'targets', link.path).map(item => ({ ...item, target: undefined, extensible: true })))
  }
  return sites
}

/** 各对象上的扩展数据只查结构；扩展追加的属性按描述查，内置属性由上面的校验器查过。 */
function checkExtensible(c: Checker, document: JsonObject, model: ReportModel): void {
  for (const site of extensibleSites(document)) {
    if (site.extensible)
      c.add(checkExtensionData(site.object as JsonValue, site.path))
    const descriptors: readonly ReportPropertyDescriptor[] = site.target === undefined
      ? []
      : site.target === 'document' ? model.documentProperties : model.properties(site.target)
    if (descriptors.length > 0 && isPlainObject(site.object))
      c.add(checkProperties(descriptors, site.object as JsonRecord, { path: site.path, controls: model.controls }))
  }
}

function checkDashboard(scope: Scope, view: JsonObject, path: JsonPath): void {
  const { c } = scope
  const grid = c.objectAt(view, 'grid', path, true)
  const columns = grid ? c.number(grid, 'columns', [...path, 'grid'], { required: true, integer: true, min: 1 }) : undefined
  if (grid)
    c.number(grid, 'rowHeight', [...path, 'grid'], { required: true, min: 0, exclusiveMin: true })

  const cards = new Map<string, ViewInfo>()
  const placed: { id: string, x: number, y: number, w: number, h: number }[] = []
  for (const { item, path: at, key } of c.keyed(view, 'cards', path, 'id', { required: true })) {
    const kind = c.string(item, 'kind', at, true)
    const entry = kind === undefined ? undefined : scope.model.cards.get(kind)
    if (kind !== undefined && !entry)
      c.report('unknown-kind', [...at, 'kind'], { kind })
    c.string(item, 'title', at)
    c.string(item, 'description', at)
    const layout = c.objectAt(item, 'layout', at, true)
    if (layout) {
      const lp = [...at, 'layout']
      const x = c.number(layout, 'x', lp, { required: true, integer: true, min: 0 })
      const y = c.number(layout, 'y', lp, { required: true, integer: true, min: 0 })
      const w = c.number(layout, 'w', lp, { required: true, integer: true, min: 1 })
      const h = c.number(layout, 'h', lp, { required: true, integer: true, min: 1 })
      if (x !== undefined && y !== undefined && w !== undefined && h !== undefined) {
        if (columns !== undefined && x + w > columns)
          c.report('layout-out-of-bounds', lp, { columns })
        const other = placed.find(rect => x < rect.x + rect.w && rect.x < x + w && y < rect.y + rect.h && rect.y < y + h)
        if (other)
          c.report('layout-overlap', lp, { card: other.id })
        if (key !== undefined)
          placed.push({ id: key, x, y, w, h })
      }
    }
    let info: ViewInfo | undefined
    if (entry?.kind.data === 'query') {
      const dataset = checkBinding(scope, item, at)
      const query = checkQuery(scope, item, at, dataset)
      const keys = { dimensions: new Set(query.dimensions.keys()), measures: query.measures }
      if (entry.builtin && kind === 'chart')
        checkChart(c, item, at, keys)
      else if (entry.builtin && kind === 'metric')
        checkMetric(c, item, at, keys)
      checkKind(scope, entry, item, at, keys, dataset)
      info = { dataset, dimensions: query.dimensions }
    }
    else if (entry?.kind.data === 'view') {
      const nested = c.objectAt(item, 'view', at, true)
      info = nested ? checkDataView(scope, nested, [...at, 'view'], ['table', 'group', 'crosstab']) : undefined
      checkKind(scope, entry, item, at, NO_KEYS, info?.dataset)
    }
    else if (entry) {
      checkKind(scope, entry, item, at, NO_KEYS, undefined)
    }
    if (key !== undefined && info)
      cards.set(key, info)
  }

  for (const { item, path: at } of c.keyed(view, 'links', path, 'id')) {
    const source = c.string(item, 'card', at, true)
    const sourceInfo = source === undefined ? undefined : cards.get(source)
    if (source !== undefined && !sourceInfo)
      c.report('unknown-card', [...at, 'card'], { card: source })
    const dimension = c.string(item, 'dimension', at, true)
    if (sourceInfo && dimension !== undefined && !sourceInfo.dimensions.has(dimension))
      c.report('unknown-dimension', [...at, 'dimension'], { key: dimension })
    const bucket = sourceInfo && dimension !== undefined ? sourceInfo.dimensions.get(dimension) : undefined
    c.array(item, 'targets', at, true, true)?.forEach((value, index) => {
      const tp = [...at, 'targets', index]
      const target = c.object(value, tp)
      if (!target)
        return
      const card = c.string(target, 'card', tp, true)
      const targetInfo = card === undefined ? undefined : cards.get(card)
      if (card !== undefined && !targetInfo)
        c.report('unknown-card', [...tp, 'card'], { card })
      const field = checkField(scope, target, 'field', tp, targetInfo?.dataset)
      if (bucket !== undefined && field?.type !== undefined && !DATE_TYPES.includes(field.type))
        c.report('link-target-type-mismatch', [...tp, 'field'], { type: field.type })
    })
  }
}

function checkParameterValue(scope: Scope, value: unknown, path: JsonPath, type: FieldType | undefined, multiple: boolean): void {
  if (Array.isArray(value)) {
    if (!multiple)
      scope.c.report('operand-shape', path)
    value.forEach((item, index) => checkLiteral(scope, item, [...path, index], type))
    return
  }
  checkLiteral(scope, value, path, type)
}

/** 日期写法的说明，放进 invalid-value 的 expected。 */
const DATE_LAYOUTS = { date: 'YYYY-MM-DD', datetime: 'YYYY-MM-DDTHH:mm[:ss]' } as const

/**
 * 候选项的取值：date、datetime 先按 designer-kit 的 options（valueType 同参数类型）查写法，
 * 通过后与其他类型一样按参数类型查。
 */
function checkOptionValue(scope: Scope, value: unknown, path: JsonPath, type: FieldType | undefined): void {
  if (type === 'date' || type === 'datetime') {
    const issue = findPropertyValueIssue({ kind: 'options', valueType: type }, [{ value: value as JsonValue }])
    if (issue !== undefined) {
      const expected = issue.code === 'invalid-value' ? DATE_LAYOUTS[type] : issue.code === 'invalid-type' ? type : undefined
      scope.c.report(issue.code, path, expected === undefined ? undefined : { expected })
      return
    }
  }
  checkLiteral(scope, value, path, type)
}

function checkReportParameters(c: Checker, document: JsonObject): Map<string, ParameterInfo> {
  const result = new Map<string, ParameterInfo>()
  const scope: Scope = { c, model: createReportModel(), datasets: new Map(), parameters: new Map(), expressionEngine: undefined, variables: new Set() }
  for (const { item, path, key } of c.keyed(document, 'parameters', [], 'name')) {
    const type = c.oneOf(item, 'type', path, FIELD_TYPES, true)
    c.string(item, 'title', path)
    c.boolean(item, 'required', path)
    const multiple = c.boolean(item, 'multiple', path) ?? false
    if (item.defaultValue !== undefined)
      checkParameterValue(scope, item.defaultValue, [...path, 'defaultValue'], type, multiple)
    const seen = new Set<string>()
    c.array(item, 'options', path)?.forEach((value, index) => {
      const op = [...path, 'options', index]
      const option = c.object(value, op)
      if (!option)
        return
      if (!('value' in option)) {
        c.report('required', [...op, 'value'])
      }
      else {
        checkOptionValue(scope, option.value, [...op, 'value'], type)
        if (isScalar(option.value)) {
          const valueId = JSON.stringify(option.value)
          if (seen.has(valueId))
            c.report('duplicate-value', [...op, 'value'])
          seen.add(valueId)
        }
      }
      c.string(option, 'label', op)
      c.boolean(option, 'disabled', op)
    })
    if (key !== undefined && type !== undefined)
      result.set(key, { type, multiple })
  }
  return result
}

function checkDatasets(c: Checker, document: JsonObject, expressionEngine: ExpressionEngine | undefined, variables: ReadonlySet<string>): Map<string, DatasetInfo> {
  const result = new Map<string, DatasetInfo>()
  for (const { item, path, key } of c.keyed(document, 'datasets', [], 'id', { required: true })) {
    c.string(item, 'title', path)
    const fields = new Map<string, FieldType>()
    const formulas: FormulaSite[] = []
    for (const field of c.keyed(item, 'fields', path, 'name', { required: true, nonEmpty: true })) {
      checkReserved({ c }, field.key, field.path, 'name')
      const type = c.oneOf(field.item, 'type', field.path, FIELD_TYPES, true)
      c.string(field.item, 'title', field.path)
      const expression = c.string(field.item, 'formula', field.path)
      if (field.key !== undefined && type !== undefined)
        fields.set(field.key, type)
      if (field.key !== undefined && expression !== undefined)
        formulas.push({ name: field.key, expression, path: [...field.path, 'formula'] })
    }
    checkFormulas(c, expressionEngine, formulas, withVariables(new Set(fields.keys()), variables))
    const parameters = new Map<string, { type: FieldType, required: boolean, multiple: boolean }>()
    for (const parameter of c.keyed(item, 'parameters', path, 'name')) {
      const type = c.oneOf(parameter.item, 'type', parameter.path, FIELD_TYPES, true)
      c.string(parameter.item, 'title', parameter.path)
      const required = c.boolean(parameter.item, 'required', parameter.path) ?? false
      const multiple = c.boolean(parameter.item, 'multiple', parameter.path) ?? false
      if (parameter.key !== undefined && type !== undefined)
        parameters.set(parameter.key, { type, required, multiple })
    }
    if (key !== undefined)
      result.set(key, { fields, parameters })
  }
  return result
}

/** 带键数组所在的属性名到问题 target 的 kind。 */
const TARGET_KINDS: Readonly<Record<string, string>> = {
  cards: 'card',
  columns: 'column',
  conditions: 'condition',
  datasets: 'dataset',
  dimensions: 'dimension',
  fields: 'field',
  groups: 'group',
  links: 'link',
  measures: 'measure',
  parameters: 'parameter',
  rows: 'row',
  series: 'series',
}

/** 问题所在的带键对象：沿路径取最内层带 id（没有时取 name）的数组项，kind 按它所在的属性名取。 */
function targetOf(document: unknown, path: JsonPath): SchemaIssueTarget | undefined {
  let node = document
  let target: SchemaIssueTarget | undefined
  for (let i = 0; i < path.length; i++) {
    const segment = path[i]!
    if (Array.isArray(node) && typeof segment === 'number' && segment < node.length) {
      node = node[segment]
      const owner = path[i - 1]
      const key = itemKey(node)
      if (key !== undefined && typeof owner === 'string' && Object.hasOwn(TARGET_KINDS, owner))
        target = { kind: TARGET_KINDS[owner]!, id: key }
    }
    else if (isPlainObject(node) && typeof segment === 'string' && Object.hasOwn(node, segment)) {
      node = node[segment]
    }
    else {
      break
    }
  }
  return target
}

/**
 * 校验报表文档，返回全部问题；没有问题时为空数组。不会抛出。
 * 问题的 path 只用对象属性名与数组下标；落在带 id（或 name）的数组项里时，target 给出最内层那一项的 kind 与键。
 * 报表的问题都是 error。
 */
export function validateDocument(document: unknown, options: ValidateOptions = {}): ValidationIssue[] {
  const c = new Checker()
  if (isPlainObject(document))
    checkDocument(c, document, options)
  else
    c.report('invalid-type', [], { expected: 'object' })
  const located = c.issues.map((issue) => {
    const target = targetOf(document, issue.path)
    return target ? { ...issue, target } : issue
  })
  return withSeverity(located, {})
}

function checkDocument(c: Checker, document: JsonObject, options: ValidateOptions): void {
  const version = document.schemaVersion
  if (version === undefined)
    c.report('required', ['schemaVersion'])
  else if (version !== REPORT_SCHEMA_VERSION)
    c.report('unsupported-schema-version', ['schemaVersion'], { version: isScalar(version) ? version as string | number | boolean | null : null })
  c.string(document, 'id', [], true)
  c.string(document, 'title', [])
  c.string(document, 'description', [])
  const model = createReportModel(options.extensions)
  const parameters = checkReportParameters(c, document)
  const variables = new Set([...parameters.keys()].map(name => `$${name}`))
  const datasets = checkDatasets(c, document, options.expressionEngine, variables)
  const body = c.objectAt(document, 'body', [], true)
  if (body)
    checkBody({ c, model, datasets, parameters, expressionEngine: options.expressionEngine, variables }, body, ['body'])
  checkExtensible(c, document, model)
  c.add(runExtensionRules(model.extensions, document as unknown as ReportDocument, { model }))
}
