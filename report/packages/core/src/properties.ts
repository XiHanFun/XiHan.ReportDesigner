/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 设计器属性面板的描述（@xihan-ui/designer-kit/properties）：各函数的路径都相对被编辑的那个对象，
// 卡片、图表配置、系列、视图与列表项各给一套，标签由语言包按 formatJsonPath(path) 查。

import type { JsonPath, JsonPrimitive } from '@xihan-ui/core/json'
import type { PropertyCondition, PropertyControl, PropertyDescriptor } from '@xihan-ui/designer-kit/properties'
import type { ReportCardData, ReportKindEntry, ReportPropertyTarget, ReportViewData } from './extensions'
import type { ChartSpec, DashboardCard, DataView, FieldType } from './schema'
import { SYMBOL_NAMES } from '@xihan-ui/viz'
import {
  AGGREGATE_KINDS,
  AXIS_LABEL_OVERFLOWS,
  AXIS_SCALES,
  BAR_LABELS,
  BAR_SHAPES,
  BAR_STACK_OFFSETS,
  CARTESIAN_ORIENTATIONS,
  CHART_INTERACTION_AXES,
  CHART_PALETTES,
  CHART_RENDERERS,
  CHART_SIZES,
  CHART_TONES,
  CHART_TRIGGERS,
  CHART_TYPES,
  COLUMN_ALIGNS,
  COLUMN_STICKY_SIDES,
  DATE_BUCKETS,
  FIELD_TYPES,
  FUNNEL_ALIGNS,
  FUNNEL_CONVERSIONS,
  FUNNEL_DIRECTIONS,
  FUNNEL_LABELS,
  FUNNEL_SHAPES,
  HEATMAP_SCALES,
  HEATMAP_VARIANTS,
  HIERARCHY_COLOR_BY,
  HIERARCHY_LAYOUTS,
  HIERARCHY_ORIENTATIONS,
  HIERARCHY_TILES,
  LINE_CURVES,
  LINE_LABELS,
  LINE_STACK_OFFSETS,
  LINE_SYMBOLS,
  MEASURES_ON,
  NULLS_POSITIONS,
  PIE_LABEL_CONTENTS,
  PIE_LABELS,
  PIE_SORTS,
  PIE_SWEEPS,
  PIE_VARIANTS,
  RADAR_CURVES,
  RADAR_SCALES,
  RADAR_SHAPES,
  SANKEY_LINK_COLORS,
  SANKEY_NODE_ALIGNS,
  SANKEY_NODE_SORTS,
  SANKEY_ORIENTATIONS,
  SERIES_MARKS,
  SORT_DIRECTIONS,
  SPARKLINE_CURVES,
  SPARKLINE_MARKERS,
  SPARKLINE_VARIANTS,
  TOOLTIP_ORDERS,
} from './schema'

/**
 * 报表的编辑方式：designer-kit 的内建方式，加上报表自己的几种。
 * - dataset：报表里的数据集 id；
 * - field：所在数据集的字段名，types 只列这些类型的字段；
 * - dimension / measure：所在查询的维度 id / 度量 id；queryKey 是两者之一；
 * - parameterValue：报表参数的取值，按参数的 type 与 multiple；
 * - card：看板上的卡片 id；cardDimension：联动源卡片上能发出取值的维度。
 */
export type ReportPropertyControl
  = | PropertyControl
    | { readonly kind: 'dataset' }
    | { readonly kind: 'field', readonly types?: readonly FieldType[] }
    | { readonly kind: 'dimension' }
    | { readonly kind: 'measure' }
    | { readonly kind: 'queryKey' }
    | { readonly kind: 'parameterValue' }
    | { readonly kind: 'card' }
    | { readonly kind: 'cardDimension' }

/** 报表的属性描述。 */
export type ReportPropertyDescriptor = PropertyDescriptor<ReportPropertyControl>

/** 属性分组的先后。 */
export const REPORT_PROPERTY_GROUPS = ['basic', 'data', 'display', 'axis', 'style', 'interaction', 'totals', 'sparkline'] as const

/** 属性分组。 */
export type ReportPropertyGroup = (typeof REPORT_PROPERTY_GROUPS)[number]

interface PropertyExtra {
  readonly required?: boolean
  readonly visibleWhen?: PropertyCondition
}

function property(path: JsonPath, group: ReportPropertyGroup, control: ReportPropertyControl, extra: PropertyExtra = {}): ReportPropertyDescriptor {
  return { path, group, control, ...extra }
}

function choices(values: readonly JsonPrimitive[]): ReportPropertyControl {
  return { kind: 'select', options: values.map(value => ({ value })) }
}

const TEXT: ReportPropertyControl = { kind: 'text' }
const BOOLEAN: ReportPropertyControl = { kind: 'boolean' }
const JSON_VALUE: ReportPropertyControl = { kind: 'json' }
const DIMENSION: ReportPropertyControl = { kind: 'dimension' }
const MEASURE: ReportPropertyControl = { kind: 'measure' }
const NUMERIC_FORMAT: ReportPropertyControl = { kind: 'format', kinds: ['number', 'percent'] }
/** 筛选条件树：designer-kit 内建的 filter，新建的条件与组带 id（校验按 id 认条件）；字段与参数由设计器按所在数据集与报表参数填。 */
const FILTER: ReportPropertyControl = { kind: 'filter', ids: true }

function integer(min: number, max?: number): ReportPropertyControl {
  return max === undefined ? { kind: 'number', integer: true, min } : { kind: 'number', integer: true, min, max }
}

/** 报表文档的属性：标题与说明。 */
export function documentProperties(): ReportPropertyDescriptor[] {
  return [
    property(['title'], 'basic', TEXT),
    property(['description'], 'basic', { kind: 'text', multiline: true }),
  ]
}

/** 看板本身的属性：网格的列数与行高（px）。 */
export function dashboardProperties(): ReportPropertyDescriptor[] {
  return [
    property(['grid', 'columns'], 'basic', integer(1), { required: true }),
    property(['grid', 'rowHeight'], 'basic', { kind: 'number', exclusiveMin: 0, unit: 'px' }, { required: true }),
  ]
}

/** 带查询的卡片与扩展视图的取数属性：数据集、参数绑定与查询的筛选、行数上限。 */
function queryDataProperties(): ReportPropertyDescriptor[] {
  return [
    property(['dataset'], 'data', { kind: 'dataset' }, { required: true }),
    property(['parameters'], 'data', JSON_VALUE),
    property(['query', 'filter'], 'data', FILTER),
    property(['query', 'limit'], 'data', integer(1)),
  ]
}

function builtinCardData(kind: string): ReportCardData {
  return kind === 'table' ? 'view' : kind === 'chart' || kind === 'metric' ? 'query' : 'none'
}

/**
 * 卡片自身的属性：标题、说明；带查询的卡片（图表、指标，或取数形状为 query 的扩展卡片）还有数据集、参数绑定与查询的筛选、行数上限。
 * data 是卡片种类的取数形状，内置种类可以不给；扩展种类按它登记的形状给。
 * 图表配置、指标配置与带视图的卡片的视图另用 chartProperties、metricProperties、viewProperties。
 */
export function cardProperties(card: Pick<DashboardCard, 'kind'>, data: ReportCardData = builtinCardData(card.kind)): ReportPropertyDescriptor[] {
  const base = [
    property(['title'], 'basic', TEXT),
    property(['description'], 'basic', { kind: 'text', multiline: true }),
  ]
  return data === 'query' ? [...base, ...queryDataProperties()] : base
}

/** 作主体的扩展视图的属性：取数形状为 query 时是取数属性，none 时没有。 */
export function extensionViewProperties(data: Extract<ReportViewData, 'query' | 'none'>): ReportPropertyDescriptor[] {
  return data === 'query' ? queryDataProperties() : []
}

/** 坐标轴的属性，路径相对图表配置。 */
function axisProperties(axis: 'xAxis' | 'yAxis'): ReportPropertyDescriptor[] {
  return [
    property([axis, 'title'], 'axis', TEXT),
    property([axis, 'scale'], 'axis', choices(AXIS_SCALES)),
    property([axis, 'format'], 'axis', { kind: 'format' }),
    property([axis, 'grid'], 'axis', BOOLEAN),
    property([axis, 'zero'], 'axis', BOOLEAN),
    property([axis, 'nice'], 'axis', BOOLEAN),
    property([axis, 'reverse'], 'axis', BOOLEAN),
    property([axis, 'ticks'], 'axis', integer(1)),
    property([axis, 'labelOverflow'], 'axis', choices(AXIS_LABEL_OVERFLOWS)),
  ]
}

/** 图表配置的属性，路径相对图表配置；直角坐标图的系列另用 seriesProperties。 */
export function chartProperties(type: ChartSpec['type']): ReportPropertyDescriptor[] {
  switch (type) {
    case 'cartesian':
      return [
        property(['splitBy'], 'data', DIMENSION),
        property(['orientation'], 'display', choices(CARTESIAN_ORIENTATIONS)),
        property(['totals'], 'display', BOOLEAN),
        property(['palette'], 'style', choices(CHART_PALETTES)),
        property(['renderer'], 'style', choices(CHART_RENDERERS)),
        ...axisProperties('xAxis'),
        ...axisProperties('yAxis'),
        property(['trigger'], 'interaction', choices(CHART_TRIGGERS)),
        property(['tooltipOrder'], 'interaction', choices(TOOLTIP_ORDERS)),
        property(['zoom'], 'interaction', choices(CHART_INTERACTION_AXES)),
        property(['brush'], 'interaction', choices(CHART_INTERACTION_AXES)),
        property(['annotations'], 'display', JSON_VALUE),
      ]
    case 'pie':
      return [
        property(['nameField'], 'data', DIMENSION, { required: true }),
        property(['valueField'], 'data', MEASURE, { required: true }),
        property(['variant'], 'display', choices(PIE_VARIANTS)),
        property(['rose'], 'display', BOOLEAN),
        property(['sweep'], 'display', choices(PIE_SWEEPS)),
        property(['sort'], 'display', choices(PIE_SORTS)),
        property(['maxSlices'], 'display', integer(1)),
        property(['labels'], 'display', choices(PIE_LABELS)),
        property(['labelContent'], 'display', choices(PIE_LABEL_CONTENTS)),
        property(['format'], 'display', NUMERIC_FORMAT),
      ]
    case 'funnel':
      return [
        property(['nameField'], 'data', DIMENSION, { required: true }),
        property(['valueField'], 'data', MEASURE, { required: true }),
        property(['shape'], 'display', choices(FUNNEL_SHAPES)),
        property(['align'], 'display', choices(FUNNEL_ALIGNS)),
        property(['direction'], 'display', choices(FUNNEL_DIRECTIONS)),
        property(['conversion'], 'display', choices(FUNNEL_CONVERSIONS)),
        property(['labels'], 'display', choices(FUNNEL_LABELS)),
        property(['palette'], 'style', choices(CHART_PALETTES)),
        property(['format'], 'display', NUMERIC_FORMAT),
      ]
    case 'radar':
      return [
        property(['nameField'], 'data', DIMENSION, { required: true }),
        property(['indicators'], 'data', JSON_VALUE, { required: true }),
        property(['shape'], 'display', choices(RADAR_SHAPES)),
        property(['area'], 'display', BOOLEAN),
        property(['scale'], 'display', choices(RADAR_SCALES)),
        property(['curve'], 'display', choices(RADAR_CURVES)),
        property(['rings'], 'display', integer(2, 10)),
        property(['ringLabels'], 'display', BOOLEAN),
        property(['format'], 'display', NUMERIC_FORMAT),
      ]
    case 'sankey':
      return [
        property(['sourceField'], 'data', DIMENSION, { required: true }),
        property(['targetField'], 'data', DIMENSION, { required: true }),
        property(['valueField'], 'data', MEASURE, { required: true }),
        property(['orientation'], 'display', choices(SANKEY_ORIENTATIONS)),
        property(['nodeAlign'], 'display', choices(SANKEY_NODE_ALIGNS)),
        property(['linkColor'], 'style', choices(SANKEY_LINK_COLORS)),
        property(['nodeSort'], 'display', choices(SANKEY_NODE_SORTS)),
        property(['format'], 'display', NUMERIC_FORMAT),
      ]
    case 'heatmap': {
      const dated: PropertyCondition = { path: ['variant'], oneOf: ['calendar', 'month'] }
      const matrix: PropertyCondition = { path: ['variant'], equals: 'matrix' }
      return [
        property(['variant'], 'data', choices(HEATMAP_VARIANTS), { required: true }),
        property(['valueField'], 'data', MEASURE, { required: true }),
        property(['dateField'], 'data', DIMENSION, { required: true, visibleWhen: dated }),
        property(['startDate'], 'data', { kind: 'text', placeholder: 'YYYY-MM-DD' }, { visibleWhen: dated }),
        property(['endDate'], 'data', { kind: 'text', placeholder: 'YYYY-MM-DD' }, { visibleWhen: dated }),
        property(['firstDayOfWeek'], 'display', integer(0, 6), { visibleWhen: dated }),
        property(['rowField'], 'data', DIMENSION, { required: true, visibleWhen: matrix }),
        property(['columnField'], 'data', DIMENSION, { required: true, visibleWhen: matrix }),
        property(['levels'], 'display', integer(1)),
        property(['thresholds'], 'display', JSON_VALUE),
        property(['scale'], 'display', choices(HEATMAP_SCALES)),
        property(['midpoint'], 'display', { kind: 'number' }),
        property(['continuous'], 'display', BOOLEAN),
        property(['tone'], 'style', choices(CHART_TONES)),
        property(['palette'], 'style', choices(CHART_PALETTES)),
        property(['size'], 'style', choices(CHART_SIZES)),
      ]
    }
    case 'hierarchy':
      return [
        property(['levels'], 'data', { kind: 'tags' }, { required: true }),
        property(['valueField'], 'data', MEASURE, { required: true }),
        property(['layout'], 'display', choices(HIERARCHY_LAYOUTS)),
        property(['tile'], 'display', choices(HIERARCHY_TILES)),
        property(['depth'], 'display', integer(1)),
        property(['colorBy'], 'style', choices(HIERARCHY_COLOR_BY)),
        property(['palette'], 'style', choices(CHART_PALETTES)),
        property(['orientation'], 'display', choices(HIERARCHY_ORIENTATIONS)),
        property(['format'], 'display', NUMERIC_FORMAT),
      ]
  }
}

/** 直角坐标图一个系列的属性，路径相对系列；各标记的专有属性只在该标记下显示。 */
export function seriesProperties(): ReportPropertyDescriptor[] {
  const bar: PropertyCondition = { path: ['mark'], equals: 'bar' }
  const line: PropertyCondition = { path: ['mark'], equals: 'line' }
  const scatter: PropertyCondition = { path: ['mark'], equals: 'scatter' }
  const categorical: PropertyCondition = { path: ['mark'], oneOf: ['bar', 'line'] }
  return [
    property(['mark'], 'basic', choices(SERIES_MARKS), { required: true }),
    property(['name'], 'basic', TEXT),
    property(['x'], 'data', DIMENSION, { required: true, visibleWhen: categorical }),
    property(['x'], 'data', { kind: 'queryKey' }, { required: true, visibleWhen: scatter }),
    property(['y'], 'data', MEASURE, { required: true }),
    property(['size'], 'data', MEASURE, { visibleWhen: scatter }),
    property(['color'], 'data', MEASURE, { visibleWhen: scatter }),
    property(['stack'], 'display', TEXT, { visibleWhen: categorical }),
    property(['shape'], 'display', choices(BAR_SHAPES), { visibleWhen: bar }),
    property(['stackOffset'], 'display', choices(BAR_STACK_OFFSETS), { visibleWhen: bar }),
    property(['labels'], 'display', choices(BAR_LABELS), { visibleWhen: bar }),
    property(['curve'], 'display', choices(LINE_CURVES), { visibleWhen: line }),
    property(['area'], 'display', BOOLEAN, { visibleWhen: line }),
    property(['stackOffset'], 'display', choices(LINE_STACK_OFFSETS), { visibleWhen: line }),
    property(['symbols'], 'display', choices(LINE_SYMBOLS), { visibleWhen: line }),
    property(['connectNulls'], 'display', BOOLEAN, { visibleWhen: line }),
    property(['labels'], 'display', choices(LINE_LABELS), { visibleWhen: line }),
    property(['endLabel'], 'display', BOOLEAN, { visibleWhen: line }),
    property(['symbol'], 'display', choices(SYMBOL_NAMES), { visibleWhen: scatter }),
    property(['jitter'], 'display', { kind: 'number', min: 0, max: 1, step: 0.1 }, { visibleWhen: scatter }),
    property(['slot'], 'style', integer(1, 8)),
    property(['tone'], 'style', choices(CHART_TONES)),
  ]
}

/** 指标卡片配置的属性，路径相对指标配置；迷你图的属性只在写了迷你图时显示。 */
export function metricProperties(): ReportPropertyDescriptor[] {
  const sparkline: PropertyCondition = { path: ['sparkline'], filled: true }
  return [
    property(['value'], 'data', MEASURE, { required: true }),
    property(['baseline'], 'data', MEASURE),
    property(['prefix'], 'display', TEXT),
    property(['suffix'], 'display', TEXT),
    property(['format'], 'display', NUMERIC_FORMAT),
    property(['size'], 'style', choices(CHART_SIZES)),
    property(['tone'], 'style', choices(CHART_TONES)),
    property(['sparkline', 'x'], 'sparkline', DIMENSION, { required: true, visibleWhen: sparkline }),
    property(['sparkline', 'y'], 'sparkline', MEASURE, { required: true, visibleWhen: sparkline }),
    property(['sparkline', 'variant'], 'sparkline', choices(SPARKLINE_VARIANTS), { visibleWhen: sparkline }),
    property(['sparkline', 'curve'], 'sparkline', choices(SPARKLINE_CURVES), { visibleWhen: sparkline }),
    property(['sparkline', 'markers'], 'sparkline', choices(SPARKLINE_MARKERS), { visibleWhen: sparkline }),
    property(['sparkline', 'tone'], 'sparkline', choices(CHART_TONES), { visibleWhen: sparkline }),
  ]
}

/** 视图的属性，路径相对视图（报表主体或表格卡片的 view）；列表里的项另用各自的描述。 */
export function viewProperties(type: DataView['type']): ReportPropertyDescriptor[] {
  const data = [
    property(['dataset'], 'data', { kind: 'dataset' }, { required: true }),
    property(['parameters'], 'data', JSON_VALUE),
    property(['filter'], 'data', FILTER),
  ]
  switch (type) {
    case 'table':
      return [...data, property(['sort'], 'data', JSON_VALUE), property(['limit'], 'data', integer(1))]
    case 'group':
      return [
        ...data,
        property(['sort'], 'data', JSON_VALUE),
        property(['detail'], 'display', BOOLEAN),
        property(['grandTotal'], 'totals', BOOLEAN),
      ]
    case 'crosstab':
      return [
        ...data,
        property(['measuresOn'], 'display', choices(MEASURES_ON)),
        property(['rowTotals', 'subtotals'], 'totals', BOOLEAN),
        property(['rowTotals', 'grandTotal'], 'totals', BOOLEAN),
        property(['columnTotals', 'subtotals'], 'totals', BOOLEAN),
        property(['columnTotals', 'grandTotal'], 'totals', BOOLEAN),
      ]
  }
}

/** 维度排序的属性，路径相对所在对象。 */
function axisSortProperties(): ReportPropertyDescriptor[] {
  return [
    property(['sort', 'by'], 'data', { kind: 'queryKey' }),
    property(['sort', 'direction'], 'data', choices(SORT_DIRECTIONS)),
    property(['sort', 'nulls'], 'data', choices(NULLS_POSITIONS)),
  ]
}

/** 明细表与分组报表一列的属性，路径相对列；汇总写聚合或公式之一。 */
export function tableColumnProperties(): ReportPropertyDescriptor[] {
  return [
    property(['field'], 'data', { kind: 'field' }, { required: true }),
    property(['title'], 'basic', TEXT),
    property(['format'], 'display', { kind: 'format' }),
    property(['width'], 'display', { kind: 'number', exclusiveMin: 0, unit: 'px' }),
    property(['align'], 'display', choices(COLUMN_ALIGNS)),
    property(['sticky'], 'display', choices(COLUMN_STICKY_SIDES)),
    property(['summary', 'aggregate'], 'totals', choices(AGGREGATE_KINDS), { visibleWhen: { path: ['summary', 'formula'], filled: false } }),
    property(['summary', 'formula'], 'totals', TEXT, { visibleWhen: { path: ['summary', 'aggregate'], filled: false } }),
  ]
}

/** 分组报表一级分组的属性，路径相对分组。 */
export function groupLevelProperties(): ReportPropertyDescriptor[] {
  return [
    property(['field'], 'data', { kind: 'field' }, { required: true }),
    property(['bucket'], 'data', choices(DATE_BUCKETS)),
    property(['title'], 'basic', TEXT),
    property(['format'], 'display', { kind: 'format' }),
    ...axisSortProperties(),
    property(['header'], 'display', BOOLEAN),
    property(['subtotal'], 'totals', BOOLEAN),
  ]
}

/** 查询或交叉表一个维度的属性，路径相对维度。 */
export function dimensionProperties(): ReportPropertyDescriptor[] {
  return [
    property(['field'], 'data', { kind: 'field' }, { required: true }),
    property(['bucket'], 'data', choices(DATE_BUCKETS)),
    property(['title'], 'basic', TEXT),
    property(['format'], 'display', { kind: 'format' }),
    ...axisSortProperties(),
  ]
}

/** 一个度量的属性，路径相对度量：写了 formula 的是公式度量，否则是聚合度量。 */
export function measureProperties(): ReportPropertyDescriptor[] {
  const aggregate: PropertyCondition = { path: ['formula'], filled: false }
  return [
    property(['title'], 'basic', TEXT),
    property(['aggregate'], 'data', choices(AGGREGATE_KINDS), { required: true, visibleWhen: aggregate }),
    property(['field'], 'data', { kind: 'field' }, { visibleWhen: aggregate }),
    property(['formula'], 'data', TEXT, { required: true, visibleWhen: { path: ['aggregate'], filled: false } }),
    property(['format'], 'display', { kind: 'format' }),
  ]
}

/** 数据集一个字段的属性，路径相对字段。 */
export function datasetFieldProperties(): ReportPropertyDescriptor[] {
  return [
    property(['name'], 'basic', TEXT, { required: true }),
    property(['type'], 'basic', choices(FIELD_TYPES), { required: true }),
    property(['title'], 'basic', TEXT),
    property(['formula'], 'data', TEXT),
  ]
}

/** 报表参数的属性，路径相对参数。固定候选项是内建的选项表，取值的类型跟着参数的类型，每种类型一条描述。 */
export function parameterProperties(): ReportPropertyDescriptor[] {
  return [
    property(['name'], 'basic', TEXT, { required: true }),
    property(['type'], 'basic', choices(FIELD_TYPES), { required: true }),
    property(['title'], 'basic', TEXT),
    property(['required'], 'data', BOOLEAN),
    property(['multiple'], 'data', BOOLEAN),
    property(['defaultValue'], 'data', { kind: 'parameterValue' }),
    ...FIELD_TYPES.map(type => property(['options'], 'data', { kind: 'options', valueType: type }, { visibleWhen: { path: ['type'], equals: type } })),
  ]
}

/** 看板联动的属性，路径相对联动。 */
export function linkProperties(): ReportPropertyDescriptor[] {
  return [
    property(['card'], 'data', { kind: 'card' }, { required: true }),
    property(['dimension'], 'data', { kind: 'cardDimension' }, { required: true }),
    property(['targets'], 'data', JSON_VALUE, { required: true }),
  ]
}

const DATA_VIEW_TYPES: ReadonlySet<string> = new Set(['table', 'group', 'crosstab'])

/** 某类对象的内置属性；扩展追加的属性不能与它们同路径。kinds 给出卡片与视图种类的取数形状。 */
export function builtinProperties(
  target: ReportPropertyTarget,
  kinds: { readonly cards: ReadonlyMap<string, ReportKindEntry<{ readonly data: ReportCardData }>>, readonly views: ReadonlyMap<string, ReportKindEntry<{ readonly data: ReportViewData }>> },
): ReportPropertyDescriptor[] {
  const [head, name] = target.split(/:(.*)/s) as [string, string | undefined]
  switch (head) {
    case 'dashboard':
      return dashboardProperties()
    case 'card': {
      const data = kinds.cards.get(name ?? '')?.kind.data
      return data === undefined ? [] : cardProperties({ kind: name as DashboardCard['kind'] }, data)
    }
    case 'chart':
      return (CHART_TYPES as readonly string[]).includes(name ?? '') ? chartProperties(name as ChartSpec['type']) : []
    case 'series':
      return seriesProperties()
    case 'metric':
      return metricProperties()
    case 'view': {
      if (DATA_VIEW_TYPES.has(name ?? ''))
        return viewProperties(name as DataView['type'])
      const data = kinds.views.get(name ?? '')?.kind.data
      return data === 'query' || data === 'none' ? extensionViewProperties(data) : []
    }
    case 'column':
      return tableColumnProperties()
    case 'group-level':
      return groupLevelProperties()
    case 'dimension':
      return dimensionProperties()
    case 'measure':
      return measureProperties()
    case 'field':
      return datasetFieldProperties()
    case 'parameter':
      return parameterProperties()
    case 'link':
      return linkProperties()
    default:
      return []
  }
}
