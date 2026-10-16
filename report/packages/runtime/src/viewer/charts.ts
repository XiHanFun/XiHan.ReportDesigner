/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 图表卡片：core 的 chartData 整好数据，这里写成 UI 图表元素的外壳与属性；类目值换成显示文字，联动时再换回原值。

import type { CartesianAxisSpec, CartesianChartData, ChartData, ChartSpec, DatasetSchema, FormatSpec, ReportQuery } from '@xihan-report/core'
import type { RenderContext } from './context'
import { valueKey } from '@xihan-ui/viz'
import { dimensionType, measureLabel } from '../labels'
import { svgPart, uiPart } from './dom'

/** 饼图把放不下的扇区并成的那一块的键。 */
const OTHER_KEY = '__other__'

/** 数值轴：类目值保持原样，不换成显示文字。 */
const CONTINUOUS_SCALES: ReadonlySet<string> = new Set(['linear', 'log', 'sqrt', 'pow', 'symlog', 'time', 'utc'])

/** UI 图表派发的 datum-press 明细里查看器用到的字段。 */
export interface ChartPress {
  readonly seriesId: string
  readonly key: unknown
  readonly datum: Readonly<Record<string, unknown>>
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

function chartShell(tag: string, label: string, parts: { readonly legend?: boolean, readonly center?: boolean, readonly path?: boolean }, emptyText: string): HTMLElement {
  const element = document.createElement(tag)
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
      if (dimension === split && members.has(press.seriesId))
        return { value: members.get(press.seriesId) }
      const spec = [...specs.values()].find(item => press.seriesId === item.id || press.seriesId.startsWith(`${item.id}:`))
      if (!spec || spec.x !== dimension)
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
 * 把图表卡片排成 UI 图表元素，label 是图表的可及名。热力图暂不支持（返回 undefined）：UI 的热力图还没有与其它图表一致的数据与事件约定。
 */
export function renderChart(chart: ChartSpec, data: ChartData, query: ReportQuery, dataset: DatasetSchema, ctx: RenderContext, label: string): RenderedChart | undefined {
  const empty = ctx.translations.empty
  switch (chart.type) {
    case 'cartesian': {
      const rendered = cartesian(chart, data as CartesianChartData, query, dataset, ctx)
      const element = chartShell('xh-cartesian-chart', label, { legend: true }, empty)
      Object.assign(element, rendered.props)
      return { element, valueOf: rendered.valueOf, keyOf: rendered.keyOf }
    }
    case 'pie':
    case 'funnel':
    case 'radar': {
      const labels = memberLabels(query, chart.nameField, dataset, ctx)
      const rows = (data as { rows: readonly Readonly<Record<string, unknown>>[] }).rows.map(row => ({ ...row, [chart.nameField]: labels.text(row[chart.nameField]) }))
      const tag = chart.type === 'pie' ? 'xh-pie-chart' : chart.type === 'funnel' ? 'xh-funnel-chart' : 'xh-radar-chart'
      const element = chartShell(tag, label, { legend: chart.type !== 'funnel', center: chart.type === 'pie' }, empty)
      const rest = chart.type === 'radar'
        ? { ...without(chart, ['type', 'format', 'indicators']), indicators: chart.indicators.map((indicator) => {
            const measure = query.measures.find(item => item.id === indicator.key)
            return { ...indicator, label: indicator.label ?? (measure ? measureLabel(measure, dataset) : indicator.key) }
          }) }
        : without(chart, ['type', 'format'])
      Object.assign(element, rest, { data: rows, ...(chart.format ? { format: numberFormat(chart.format, ctx) } : {}) })
      return {
        element,
        valueOf: (press, dimension) => (dimension === chart.nameField && press.key !== OTHER_KEY ? labels.raw(press.datum[chart.nameField]) : undefined),
        keyOf: (dimension, value) => (dimension === chart.nameField && chart.type !== 'radar' ? labels.text(value) : undefined),
      }
    }
    case 'sankey': {
      const sankey = data as Extract<ChartData, { type: 'sankey' }>
      const source = memberLabels(query, chart.sourceField, dataset, ctx)
      const values = new Map(sankey.nodes.map(node => [node.id, node.value]))
      const element = chartShell('xh-sankey-chart', label, { legend: true }, empty)
      Object.assign(element, without(chart, ['type', 'format', 'sourceField', 'targetField', 'valueField']), {
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
      const element = chartShell('xh-hierarchy-chart', label, { path: true }, empty)
      Object.assign(element, without(chart, ['type', 'format', 'levels', 'valueField']), {
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
      return undefined
  }
}
