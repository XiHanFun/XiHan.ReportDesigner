/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 图表卡片：core 的 chartData 整好数据，这里写成 UI 图表元素的外壳与属性；类目值换成显示文字，联动时再换回原值。
// 上一轮绘的是同种图表时复用那个元素，只换属性：刷新与联动不重放入场动效，焦点留在原处。

import type { CartesianAxisSpec, CartesianChartData, ChartData, ChartSpec, DatasetSchema, DateHeatmapData, FormatSpec, HeatmapChartSpec, MatrixHeatmapData, ReportQuery } from '@xihan-report/core'
import type { RenderContext } from './context'
import { valueKey } from '@xihan-ui/viz'
import { dimensionType, measureLabel } from '../labels'
import { svgPart, uiPart } from './dom'

/** 饼图把放不下的扇区并成的那一块的键。 */
const OTHER_KEY = '__other__'

/** 数值轴：类目值保持原样，不换成显示文字。 */
const CONTINUOUS_SCALES: ReadonlySet<string> = new Set(['linear', 'log', 'sqrt', 'pow', 'symlog', 'time', 'utc'])

/** UI 图表派发的 datum-press 明细里查看器用到的字段：图表家族带 seriesId 与 datum，热力图带 date 或 row、column。 */
export interface ChartPress {
  /** 点中的数据点在图表里的键。 */
  readonly key: unknown
  /** 点中的系列。 */
  readonly seriesId?: string
  /** 点中的数据行。 */
  readonly datum?: Readonly<Record<string, unknown>>
  /** 日历热力图点中的日期，YYYY-MM-DD。 */
  readonly date?: string
  /** 矩阵热力图点中的行。 */
  readonly row?: string
  /** 矩阵热力图点中的列。 */
  readonly column?: string
}

/** 渲染好的图表卡片。 */
export interface RenderedChart {
  readonly element: HTMLElement
  /** 由点按明细得到某个维度上的原值；这次点按与该维度无关时为 undefined。 */
  readonly valueOf: (press: ChartPress, dimension: string) => { readonly value: unknown } | undefined
  /** 某个维度上的原值在图表里的键，写进 activeKey 作强调；找不到时为 undefined。 */
  readonly keyOf: (dimension: string, value: unknown) => unknown
}

/** 类目值与显示文字的双向对照。 */
class Labels {
  readonly #text = new Map<string, string>()
  readonly #raw = new Map<string, unknown>()

  constructor(private readonly display: (value: unknown) => string) {}

  text(value: unknown): string {
    const key = valueKey(value)
    let text = this.#text.get(key)
    if (text === undefined) {
      text = this.display(value)
      this.#text.set(key, text)
      if (!this.#raw.has(text))
        this.#raw.set(text, value)
    }
    return text
  }

  raw(text: unknown): { readonly value: unknown } | undefined {
    return typeof text === 'string' && this.#raw.has(text) ? { value: this.#raw.get(text) } : undefined
  }
}

/** 图表外壳的可选部件。 */
interface ShellParts {
  readonly legend?: boolean
  readonly center?: boolean
  readonly path?: boolean
}

/** 元素建出来时的外壳样子：标签相同、外壳相同才复用。 */
const shells = new WeakMap<Element, string>()

/** 上一轮赋过的属性名。 */
const assigned = new WeakMap<Element, readonly string[]>()

/** 把属性赋到元素上：上一轮赋过、这一轮没有的设回 undefined，取值没变的不重设。 */
function assign(element: HTMLElement, props: Readonly<Record<string, unknown>>): void {
  const target = element as unknown as Record<string, unknown>
  for (const key of assigned.get(element) ?? []) {
    if (!(key in props))
      target[key] = undefined
  }
  for (const [key, value] of Object.entries(props)) {
    if (target[key] !== value)
      target[key] = value
  }
  assigned.set(element, Object.keys(props))
}

/** 上一轮的元素能复用时改写它的可及名与空态文字并交回；不能复用时为 undefined。 */
function reuseShell(previous: Element | null | undefined, tag: string, signature: string, label: string, emptyText: string): HTMLElement | undefined {
  if (!(previous instanceof HTMLElement) || previous.localName !== tag || shells.get(previous) !== signature)
    return undefined
  previous.querySelector(':scope > [data-xh-part="root"]')?.setAttribute('aria-label', label)
  const empty = previous.querySelector('[data-xh-part="empty"]')
  if (empty && empty.textContent !== emptyText)
    empty.textContent = emptyText
  return previous
}

function chartShell(tag: string, label: string, parts: ShellParts, emptyText: string, previous?: Element | null): HTMLElement {
  const signature = JSON.stringify([parts.legend ?? false, parts.center ?? false, parts.path ?? false])
  const reused = reuseShell(previous, tag, signature, label, emptyText)
  if (reused)
    return reused
  const element = document.createElement(tag)
  shells.set(element, signature)
  const root = uiPart('figure', 'root', { 'aria-label': label })
  if (parts.path)
    root.append(uiPart('nav', 'path'))
  if (parts.legend)
    root.append(uiPart('div', 'legend'))
  const viewport = uiPart('div', 'viewport')
  viewport.append(svgPart('plot'))
  if (parts.center)
    viewport.append(uiPart('div', 'center'))
  viewport.append(uiPart('div', 'empty', {}, emptyText))
  root.append(viewport, uiPart('div', 'tooltip'))
  element.append(root)
  return element
}

function numberFormat(format: FormatSpec | undefined, ctx: RenderContext): ((value: number) => string) | undefined {
  return format ? value => ctx.text(value, format, undefined) : undefined
}

function axis(spec: CartesianAxisSpec | undefined, ctx: RenderContext): Record<string, unknown> | undefined {
  if (!spec)
    return undefined
  const { format, ...rest } = spec
  return format ? { ...rest, format: (value: unknown) => ctx.text(value, format, undefined) } : { ...rest }
}

function without<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...value }
  for (const key of keys)
    delete copy[key]
  return copy
}

function dimensionOf(query: ReportQuery, id: string): ReportQuery['dimensions'][number] | undefined {
  return query.dimensions.find(dimension => dimension.id === id)
}

function memberLabels(query: ReportQuery, id: string, dataset: DatasetSchema, ctx: RenderContext): Labels {
  const dimension = dimensionOf(query, id)
  return new Labels(value => ctx.member(value, dimension?.format, dimension ? dimensionType(dimension, dataset) : undefined))
}

function cartesian(chart: Extract<ChartSpec, { type: 'cartesian' }>, data: CartesianChartData, query: ReportQuery, dataset: DatasetSchema, ctx: RenderContext): Omit<RenderedChart, 'element'> & { readonly props: Record<string, unknown> } {
  const dimensionIds = new Set(query.dimensions.map(dimension => dimension.id))
  const xFields = [...new Set(chart.series.map(series => series.x).filter(x => dimensionIds.has(x)))]
  const categorical = !CONTINUOUS_SCALES.has(chart.xAxis?.scale ?? 'band')
  const labels = new Map(xFields.map(field => [field, memberLabels(query, field, dataset, ctx)]))
  const rows = categorical
    ? data.rows.map(row => ({ ...row, ...Object.fromEntries(xFields.map(field => [field, labels.get(field)!.text(row[field])])) }))
    : data.rows
  const split = chart.splitBy
  const splitLabels = split ? memberLabels(query, split, dataset, ctx) : undefined
  const specs = new Map(chart.series.map(series => [series.id, series]))
  const members = new Map<string, unknown>()
  const series = data.series.map((item) => {
    const spec = item.spec
    const field = (name: string | undefined): string | undefined => (name === undefined ? undefined : item.fields[name] ?? name)
    const y = typeof spec.y === 'string' ? field(spec.y)! : [field(spec.y[0])!, field(spec.y[1])!] as const
    const yMeasure = query.measures.find(measure => measure.id === (typeof spec.y === 'string' ? spec.y : spec.y[0]))
    const base = spec.name ?? (yMeasure ? measureLabel(yMeasure, dataset) : spec.id)
    if (item.member)
      members.set(item.id, item.member.value)
    const name = item.member ? (chart.series.length > 1 ? `${base} · ${splitLabels!.text(item.member.value)}` : splitLabels!.text(item.member.value)) : base
    const mapped: Record<string, unknown> = { ...without(spec, ['id', 'name']), id: item.id, name, y }
    if (spec.mark === 'scatter') {
      mapped.x = field(spec.x)
      if (spec.size !== undefined)
        mapped.size = field(spec.size)
      if (spec.color !== undefined)
        mapped.color = field(spec.color)
    }
    return mapped
  })
  const props: Record<string, unknown> = {
    ...without(chart, ['type', 'series', 'splitBy', 'xAxis', 'yAxis']),
    data: rows,
    series,
    ...(chart.xAxis ? { xAxis: axis(chart.xAxis, ctx) } : {}),
    ...(chart.yAxis ? { yAxis: axis(chart.yAxis, ctx) } : {}),
  }
  return {
    props,
    valueOf(press, dimension) {
      const seriesId = press.seriesId ?? ''
      if (dimension === split && members.has(seriesId))
        return { value: members.get(seriesId) }
      const spec = [...specs.values()].find(item => seriesId === item.id || seriesId.startsWith(`${item.id}:`))
      if (!spec || spec.x !== dimension || !press.datum)
        return undefined
      return categorical ? labels.get(dimension)?.raw(press.datum[dimension]) : { value: press.datum[dimension] }
    },
    keyOf(dimension, value) {
      if (!xFields.includes(dimension))
        return undefined
      return categorical ? labels.get(dimension)!.text(value) : value
    },
  }
}

/**
 * 热力图：可及名写在网格上（gridLabel）。日期形态的格子键是 ISO 日期，选中值写回 activeKey 作强调；没写区间时取数据里最早到最晚的日期。
 * 矩阵形态按行、列维度发出取值，联动选中的是整行或整列，不对应单独一格，不写 activeKey。
 */
function heatmap(chart: HeatmapChartSpec, data: DateHeatmapData | MatrixHeatmapData, query: ReportQuery, dataset: DatasetSchema, ctx: RenderContext, label: string, previous?: Element | null): RenderedChart {
  let element = previous instanceof HTMLElement && previous.localName === 'xh-heatmap' && shells.get(previous) === 'heatmap' ? previous : undefined
  if (!element) {
    element = document.createElement('xh-heatmap')
    element.append(uiPart('div', 'root'))
    shells.set(element, 'heatmap')
  }
  const measure = query.measures.find(item => item.id === chart.valueField)
  const common = {
    ...(measure?.format ? { format: numberFormat(measure.format, ctx) } : {}),
    translations: { gridLabel: label, emptyText: ctx.translations.empty, loadingText: ctx.translations.loading },
  }
  if (chart.variant === 'matrix') {
    const matrix = data as MatrixHeatmapData
    const rows = memberLabels(query, chart.rowField, dataset, ctx)
    const columns = memberLabels(query, chart.columnField, dataset, ctx)
    const rowValues = new Map(matrix.rows.map(item => [item.id, item.value]))
    const columnValues = new Map(matrix.columns.map(item => [item.id, item.value]))
    assign(element, {
      ...without(chart, ['type', 'valueField', 'rowField', 'columnField']),
      ...common,
      rows: matrix.rows.map(item => ({ value: item.id, label: rows.text(item.value) })),
      columns: matrix.columns.map(item => ({ value: item.id, label: columns.text(item.value) })),
      value: matrix.cells.map(cell => ({ ...cell })),
    })
    return {
      element,
      valueOf(press, dimension) {
        if (dimension === chart.rowField && press.row !== undefined && rowValues.has(press.row))
          return { value: rowValues.get(press.row) }
        if (dimension === chart.columnField && press.column !== undefined && columnValues.has(press.column))
          return { value: columnValues.get(press.column) }
        return undefined
      },
      keyOf: () => undefined,
    }
  }
  const cells = (data as DateHeatmapData).cells
  const dates = new Set(cells.map(cell => cell.date))
  const sorted = [...dates].sort()
  assign(element, {
    ...without(chart, ['type', 'valueField', 'dateField']),
    ...common,
    startDate: chart.startDate ?? sorted[0],
    endDate: chart.endDate ?? sorted.at(-1),
    value: cells.map(cell => ({ ...cell })),
  })
  return {
    element,
    valueOf: (press, dimension) => (dimension === chart.dateField && press.date !== undefined && dates.has(press.date) ? { value: press.date } : undefined),
    keyOf: (dimension, value) => (dimension === chart.dateField && typeof value === 'string' ? value : undefined),
  }
}

/** 把图表卡片排成 UI 图表元素，label 是图表的可及名；previous 是上一轮绘的元素，同种图表时复用它。 */
export function renderChart(chart: ChartSpec, data: ChartData, query: ReportQuery, dataset: DatasetSchema, ctx: RenderContext, label: string, previous?: Element | null): RenderedChart {
  const empty = ctx.translations.empty
  switch (chart.type) {
    case 'cartesian': {
      const rendered = cartesian(chart, data as CartesianChartData, query, dataset, ctx)
      const element = chartShell('xh-cartesian-chart', label, { legend: true }, empty, previous)
      assign(element, rendered.props)
      return { element, valueOf: rendered.valueOf, keyOf: rendered.keyOf }
    }
    case 'pie':
    case 'funnel':
    case 'radar': {
      const labels = memberLabels(query, chart.nameField, dataset, ctx)
      const rows = (data as { rows: readonly Readonly<Record<string, unknown>>[] }).rows.map(row => ({ ...row, [chart.nameField]: labels.text(row[chart.nameField]) }))
      const tag = chart.type === 'pie' ? 'xh-pie-chart' : chart.type === 'funnel' ? 'xh-funnel-chart' : 'xh-radar-chart'
      const element = chartShell(tag, label, { legend: chart.type !== 'funnel', center: chart.type === 'pie' }, empty, previous)
      const rest = chart.type === 'radar'
        ? { ...without(chart, ['type', 'format', 'indicators']), indicators: chart.indicators.map((indicator) => {
            const measure = query.measures.find(item => item.id === indicator.key)
            return { ...indicator, label: indicator.label ?? (measure ? measureLabel(measure, dataset) : indicator.key) }
          }) }
        : without(chart, ['type', 'format'])
      assign(element, { ...rest, data: rows, ...(chart.format ? { format: numberFormat(chart.format, ctx) } : {}) })
      return {
        element,
        valueOf: (press, dimension) => (dimension === chart.nameField && press.key !== OTHER_KEY ? labels.raw(press.datum?.[chart.nameField]) : undefined),
        keyOf: (dimension, value) => (dimension === chart.nameField && chart.type !== 'radar' ? labels.text(value) : undefined),
      }
    }
    case 'sankey': {
      const sankey = data as Extract<ChartData, { type: 'sankey' }>
      const source = memberLabels(query, chart.sourceField, dataset, ctx)
      const values = new Map(sankey.nodes.map(node => [node.id, node.value]))
      const element = chartShell('xh-sankey-chart', label, { legend: true }, empty, previous)
      assign(element, {
        ...without(chart, ['type', 'format', 'sourceField', 'targetField', 'valueField']),
        nodes: sankey.nodes.map(node => ({ id: node.id, name: source.text(node.value) })),
        links: sankey.links,
        ...(chart.format ? { format: numberFormat(chart.format, ctx) } : {}),
      })
      return {
        element,
        valueOf: (press, dimension) => ((dimension === chart.sourceField || dimension === chart.targetField) && typeof press.key === 'string' && values.has(press.key) ? { value: values.get(press.key) } : undefined),
        keyOf: (dimension, value) => (dimension === chart.sourceField || dimension === chart.targetField ? valueKey(value) : undefined),
      }
    }
    case 'hierarchy': {
      const hierarchy = data as Extract<ChartData, { type: 'hierarchy' }>
      const levels = chart.levels.map(level => memberLabels(query, level, dataset, ctx))
      const nodes = new Map(hierarchy.nodes.map(node => [node.id, node]))
      const element = chartShell('xh-hierarchy-chart', label, { path: true }, empty, previous)
      assign(element, {
        ...without(chart, ['type', 'format', 'levels', 'valueField']),
        data: hierarchy.nodes.map(node => ({ id: node.id, parent: node.parent, name: node.depth === 0 ? label : levels[node.depth - 1]!.text(node.value), value: node.size })),
        idField: 'id',
        parentField: 'parent',
        nameField: 'name',
        valueField: 'value',
        ...(chart.format ? { format: numberFormat(chart.format, ctx) } : {}),
      })
      return {
        element,
        valueOf(press, dimension) {
          const depth = chart.levels.indexOf(dimension) + 1
          let node = typeof press.key === 'string' ? nodes.get(press.key) : undefined
          while (node && node.depth > depth)
            node = node.parent === null ? undefined : nodes.get(node.parent)
          return node && depth > 0 && node.depth === depth ? { value: node.value } : undefined
        },
        keyOf: () => undefined,
      }
    }
    case 'heatmap':
      return heatmap(chart, data as DateHeatmapData | MatrixHeatmapData, query, dataset, ctx, label, previous)
  }
}
