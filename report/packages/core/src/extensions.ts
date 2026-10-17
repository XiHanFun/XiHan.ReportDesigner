/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表 core 层的扩展：卡片种类、主体视图种类、追加的属性、编辑方式与规则。运行时层与设计器层的扩展在它之上
// 再加渲染、导出、物料、命令与面板，core 函数只读这里的字段。内置的三种卡片也写成一个内置扩展，与传入的走同一条路。

import type { JsonPath } from '@xihan-ui/core/json'
import type { DesignerExtensionCore, ExtensionKeySpaces } from '@xihan-ui/designer-kit'
import type { ControlKind } from '@xihan-ui/designer-kit/properties'
import type { SchemaIssue } from '@xihan-ui/designer-kit/schema'
import type { ChartData } from './engine/chart-data'
import type { ViewResult } from './engine/compute'
import type { MetricResult } from './engine/dashboard'
import type { QueryResult } from './engine/query'
import type { ReportPropertyDescriptor } from './properties'
import type { CardBase, ChartCard, DatasetSchema, ExtensionCard, ExtensionView, FieldType, MetricCard, ReportDocument, TableCard } from './schema'
import type { ValidationIssue } from './validate'
import { formatJsonPath, isPlainObject } from '@xihan-ui/core/json'
import { DesignerExtensionError, extensionControls, extensionIssuePrefix, mergeExtensions } from '@xihan-ui/designer-kit'
import { chartData } from './engine/chart-data'
import { computeMetric } from './engine/dashboard'
import { builtinProperties, documentProperties } from './properties'

/** 卡片种类的取数形状：query 同图表与指标卡片（卡片上有 dataset、parameters 与 query），view 同表格卡片（带一个明细表、分组报表或交叉表），none 不取数。 */
export type ReportCardData = 'query' | 'view' | 'none'

/** 主体视图种类的取数形状：扩展视图只能是 query 或 none；table、group、crosstab、dashboard 是内置四种自己的形状。 */
export type ReportViewData = 'query' | 'none' | 'table' | 'group' | 'crosstab' | 'dashboard'

/** 种类校验拿到的上下文：公共字段与取数部分 core 已经查过。 */
export interface ReportKindCheck {
  /** 对象在文档里的路径；返回的问题路径要以它开头。 */
  readonly path: JsonPath
  /** query 形状时查询的维度与度量 id；别的形状为空集。 */
  readonly dimensions: ReadonlySet<string>
  readonly measures: ReadonlySet<string>
  /** 取数的数据集里某个字段的类型（含计算字段）；不取数、数据集未知或没有这个字段时为 undefined。 */
  readonly fieldType: (name: string) => FieldType | undefined
}

/** 交给种类计算的取数结果：query 形状是查询结果，view 形状是视图结果，none 两者都没有。 */
export interface ReportKindInput {
  readonly dataset: DatasetSchema | undefined
  readonly query?: QueryResult
  readonly view?: ViewResult
}

/** 一种卡片。 */
export interface ReportCardKind<Card extends CardBase = ExtensionCard, Value = unknown> {
  readonly data: ReportCardData
  /** 查种类自己的其余字段。扩展种类的问题码以扩展 id 的末段加点开头。 */
  readonly validate?: (card: Card, check: ReportKindCheck) => readonly SchemaIssue[]
  /** 把取数结果换成交给渲染的值；不给时值就是取数结果本身（query 形状是 QueryResult，view 形状是 ViewResult）。 */
  readonly compute?: (card: Card, input: ReportKindInput) => Value
}

/** 一种主体视图。 */
export interface ReportViewKind<View = ExtensionView, Value = unknown> {
  readonly data: ReportViewData
  readonly validate?: (view: View, check: ReportKindCheck) => readonly SchemaIssue[]
  readonly compute?: (view: View, input: ReportKindInput) => Value
}

/** 规则拿到的上下文：合并后的报表模型。 */
export interface ReportRuleContext {
  readonly model: ReportModel
}

/**
 * 属性追加到哪一类对象上：document 之外的键同属性面板的分区——dashboard、card:<种类>、chart:<图表类型>、series、metric、
 * view:<视图类型>、column、group-level、dimension、measure、field、parameter、link。
 */
export type ReportPropertyTarget
  = | 'dashboard'
    | `card:${string}`
    | `chart:${string}`
    | 'series'
    | 'metric'
    | `view:${string}`
    | 'column'
    | 'group-level'
    | 'dimension'
    | 'measure'
    | 'field'
    | 'parameter'
    | 'link'

/** 报表 core 层的扩展。 */
export interface ReportCoreExtension extends DesignerExtensionCore<ReportDocument, ReportRuleContext> {
  /** 卡片种类：键是种类名，扩展登记的带点、以扩展 id 的末段开头。 */
  readonly cards?: Readonly<Record<string, ReportCardKind<never>>>
  /** 主体视图种类：键是种类名，规则同卡片。 */
  readonly views?: Readonly<Record<string, ReportViewKind<never>>>
  /** 追加在内置之后的属性，path 相对那类对象本身。 */
  readonly properties?: Readonly<Partial<Record<ReportPropertyTarget, readonly ReportPropertyDescriptor[]>>>
  /** 文档级属性，path 相对文档本身，没选中任何对象时属性面板显示它们。 */
  readonly documentProperties?: readonly ReportPropertyDescriptor[]
  /** 这个扩展自己的问题码的说明文字；返回 undefined 时交给查看器与设计器的文案。 */
  readonly issueText?: (issue: ValidationIssue) => string | undefined
}

/** 指标卡片的计算结果。 */
export interface MetricValue {
  readonly result: QueryResult
  readonly metric: MetricResult
}

/** 合并后的一个种类：定义、登记它的扩展 id，以及是不是内置的。 */
export interface ReportKindEntry<Kind> {
  readonly name: string
  readonly kind: Kind
  readonly owner: string
  readonly builtin: boolean
}

/** 一组扩展合出的报表模型。 */
export interface ReportModel {
  /** 内置扩展在前，传入的按顺序在后。 */
  readonly extensions: readonly ReportCoreExtension[]
  readonly cards: ReadonlyMap<string, ReportKindEntry<ReportCardKind<CardBase>>>
  readonly views: ReadonlyMap<string, ReportKindEntry<ReportViewKind<unknown>>>
  readonly documentProperties: readonly ReportPropertyDescriptor[]
  readonly controls: Readonly<Record<string, ControlKind>>
  /** 扩展追加在某类对象上的属性，内置的不在其中。 */
  readonly properties: (target: ReportPropertyTarget) => readonly ReportPropertyDescriptor[]
  /** 问题的说明文字：按扩展顺序取第一个给出的；都不给时为 undefined。 */
  readonly issueText: (issue: ValidationIssue) => string | undefined
}

/** 内置扩展的 id。 */
export const REPORT_CORE_EXTENSION_ID = '@xihan-report/core'

const DATA_VIEWS: readonly ReportViewData[] = ['table', 'group', 'crosstab', 'dashboard']

const CHART_CARD: ReportCardKind<ChartCard, ChartData> = {
  data: 'query',
  compute: (card, input) => chartData(card.chart, card.query, input.query!),
}

const METRIC_CARD: ReportCardKind<MetricCard, MetricValue> = {
  data: 'query',
  compute: (card, input) => ({ result: input.query!, metric: computeMetric(card.metric, input.query!) }),
}

const TABLE_CARD: ReportCardKind<TableCard> = { data: 'view' }

const STRING_VALUE: ControlKind = { check: value => (typeof value === 'string' ? undefined : 'invalid-type') }
const OBJECT_VALUE: ControlKind = { check: value => (isPlainObject(value) ? undefined : 'invalid-type') }

/** 报表自己的编辑方式：属性描述里用到它们时 checkProperties 按这里查取值。 */
const REPORT_CONTROLS: Readonly<Record<string, ControlKind>> = {
  dataset: STRING_VALUE,
  field: STRING_VALUE,
  dimension: STRING_VALUE,
  measure: STRING_VALUE,
  queryKey: STRING_VALUE,
  card: STRING_VALUE,
  cardDimension: STRING_VALUE,
  format: OBJECT_VALUE,
  filter: OBJECT_VALUE,
  parameterValue: {},
}

/** 内置的卡片、主体视图与编辑方式。图表与指标卡片配置的校验由 core 的校验器直接做，这里登记形状与计算。 */
export const REPORT_CORE_EXTENSION: ReportCoreExtension = {
  id: REPORT_CORE_EXTENSION_ID,
  controls: REPORT_CONTROLS,
  cards: { chart: CHART_CARD, metric: METRIC_CARD, table: TABLE_CARD },
  views: Object.fromEntries(DATA_VIEWS.map(type => [type, { data: type }])),
}

function descriptorKey(target: string, path: JsonPath): string {
  return `${target} ${formatJsonPath(path)}`
}

/** 报表各层扩展共用的名字空间：卡片种类、视图种类、追加属性与文档级属性的路径。 */
export const REPORT_EXTENSION_SPACES: ExtensionKeySpaces<ReportCoreExtension> = {
  'card-kind': extension => Object.keys(extension.cards ?? {}),
  'view-kind': extension => Object.keys(extension.views ?? {}),
  'property': extension => Object.entries(extension.properties ?? {}).flatMap(([target, descriptors]) => (descriptors ?? []).map(descriptor => descriptorKey(target, descriptor.path))),
  'document-property': extension => (extension.documentProperties ?? []).map(descriptor => formatJsonPath(descriptor.path)),
}

/** 内置卡片细分种类用的前缀（chart.cartesian、table.group），扩展的种类名不能用。 */
const RESERVED_PREFIXES: ReadonlySet<string> = new Set(['chart.', 'table.'])

/** 扩展登记的种类名必须带点、以扩展 id 的末段开头；扩展视图只能是 query 或 none 形状。 */
function checkKinds(extension: ReportCoreExtension): void {
  const prefix = `${extensionIssuePrefix(extension.id)}.`
  if (RESERVED_PREFIXES.has(prefix) && (Object.keys(extension.cards ?? {}).length > 0 || Object.keys(extension.views ?? {}).length > 0))
    throw new TypeError(`[report] ${extension.id} cannot register kinds: the prefix ${prefix} is reserved for built-in card types`)
  for (const [space, kinds] of [['card', extension.cards], ['view', extension.views]] as const) {
    for (const name of Object.keys(kinds ?? {})) {
      if (!name.startsWith(prefix) || name.length === prefix.length)
        throw new TypeError(`[report] ${space} kind ${name} registered by ${extension.id} must start with ${prefix}`)
    }
  }
  for (const [name, view] of Object.entries(extension.views ?? {})) {
    if (view.data !== 'query' && view.data !== 'none')
      throw new TypeError(`[report] view kind ${name} registered by ${extension.id} must fetch data as query or none`)
  }
}

function entries<Kind>(list: readonly ReportCoreExtension[], pick: (extension: ReportCoreExtension) => Readonly<Record<string, Kind>> | undefined): Map<string, ReportKindEntry<Kind>> {
  return new Map(list.flatMap(extension => Object.entries(pick(extension) ?? {}).map(([name, kind]) => [name, {
    name,
    kind,
    owner: extension.id,
    builtin: extension.id === REPORT_CORE_EXTENSION_ID,
  }] as const)))
}

const MODELS = new WeakMap<readonly ReportCoreExtension[], ReportModel>()
const NO_EXTENSIONS: readonly ReportCoreExtension[] = []

/**
 * 合出报表模型：内置扩展 REPORT_CORE_EXTENSION 在前，extensions 按顺序在后。扩展 id、种类名、追加属性的路径、编辑方式等重名时
 * 抛 DesignerExtensionError（code 为 designer.extension-conflict）；追加的属性与内置的同路径也抛。种类名不合规时抛 TypeError。
 * 同一个数组只合一次：元素把同一份 extensions 交给各个 core 函数时不重复合并。
 */
export function createReportModel(extensions: readonly ReportCoreExtension[] = NO_EXTENSIONS): ReportModel {
  const cached = MODELS.get(extensions)
  if (cached)
    return cached
  const list = mergeExtensions([REPORT_CORE_EXTENSION], extensions, REPORT_EXTENSION_SPACES)
  for (const extension of list) {
    if (extension.id !== REPORT_CORE_EXTENSION_ID)
      checkKinds(extension)
  }
  const cards = entries(list, extension => extension.cards as Readonly<Record<string, ReportCardKind<CardBase>>> | undefined)
  const views = entries(list, extension => extension.views as Readonly<Record<string, ReportViewKind<unknown>>> | undefined)
  const kinds = { cards, views }
  const added = new Map<string, ReportPropertyDescriptor[]>()
  for (const extension of list) {
    for (const [target, descriptors] of Object.entries(extension.properties ?? {}) as [ReportPropertyTarget, readonly ReportPropertyDescriptor[]][]) {
      const builtin = new Set(builtinProperties(target, kinds).map(descriptor => formatJsonPath(descriptor.path)))
      for (const descriptor of descriptors) {
        if (builtin.has(formatJsonPath(descriptor.path)))
          throw new DesignerExtensionError('property', descriptorKey(target, descriptor.path), [REPORT_CORE_EXTENSION_ID, extension.id])
      }
      added.set(target, [...(added.get(target) ?? []), ...descriptors])
    }
  }
  const documentBuiltin = new Set(documentProperties().map(descriptor => formatJsonPath(descriptor.path)))
  for (const extension of list) {
    for (const descriptor of extension.documentProperties ?? []) {
      if (documentBuiltin.has(formatJsonPath(descriptor.path)))
        throw new DesignerExtensionError('document-property', formatJsonPath(descriptor.path), [REPORT_CORE_EXTENSION_ID, extension.id])
    }
  }
  const model: ReportModel = {
    extensions: list,
    cards,
    views,
    documentProperties: list.flatMap(extension => extension.documentProperties ?? []),
    controls: extensionControls(list),
    properties: target => added.get(target) ?? [],
    issueText: (issue) => {
      for (const extension of list) {
        const text = extension.issueText?.(issue)
        if (text !== undefined)
          return text
      }
      return undefined
    },
  }
  MODELS.set(extensions, model)
  return model
}
