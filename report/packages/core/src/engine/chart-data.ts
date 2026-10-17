/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 图表数据整形：把聚合查询的结果整成各类图表要的形状；拆系列、节点与流带、格子与层级都在这里，显示文字交给使用方。

import type { CartesianChartSpec, CartesianSeriesSpec, ChartSpec, DataRow, HeatmapChartSpec, HierarchyChartSpec, ReportQuery, SankeyChartSpec } from '../schema'
import type { QueryResult } from './query'
import { isMissing, pivotWider, tupleKey, valueKey } from '@xihan-ui/viz'

/** 直角坐标图的一条系列。 */
export interface CartesianSeriesData {
  /** 系列身份：没有拆分时同规格的 id，拆分时为「规格 id:成员编码」。 */
  readonly id: string
  readonly spec: CartesianSeriesSpec
  /** 拆分维度上的成员；没有拆分时为 undefined。 */
  readonly member?: { readonly value: unknown }
  /** 规格里写的度量 id 到 rows 里实际列名的换算；没有拆分时列名就是度量 id。 */
  readonly fields: Readonly<Record<string, string>>
}

/** 直角坐标图的数据：rows 是所有系列共用的数据行。 */
export interface CartesianChartData {
  readonly type: 'cartesian'
  readonly rows: readonly DataRow[]
  readonly series: readonly CartesianSeriesData[]
}

/** 饼图、漏斗图、雷达图的数据：查询行原样使用，字段按规格取。 */
export interface RowsChartData {
  readonly type: 'pie' | 'funnel' | 'radar'
  readonly rows: readonly DataRow[]
}

/** 桑基图的数据：节点按首次出现的次序，同值的源与目标是同一个节点。 */
export interface SankeyChartData {
  readonly type: 'sankey'
  readonly nodes: readonly { readonly id: string, readonly value: unknown }[]
  readonly links: readonly { readonly source: string, readonly target: string, readonly value: number }[]
}

/** 日期热力图的数据：每天一格，日期写 YYYY-MM-DD。 */
export interface DateHeatmapData {
  readonly type: 'heatmap'
  readonly variant: 'calendar' | 'month'
  readonly cells: readonly { readonly date: string, readonly count: number }[]
}

/** 矩阵热力图的数据：行与列按首次出现的次序。 */
export interface MatrixHeatmapData {
  readonly type: 'heatmap'
  readonly variant: 'matrix'
  readonly rows: readonly { readonly id: string, readonly value: unknown }[]
  readonly columns: readonly { readonly id: string, readonly value: unknown }[]
  readonly cells: readonly { readonly row: string, readonly column: string, readonly value: number }[]
}

/** 层级图的一个节点：根节点的 parent 为 null，叶子带数值。 */
export interface HierarchyNodeData {
  readonly id: string
  readonly parent: string | null
  /** 节点所在的层：根为 0，第一层维度为 1。 */
  readonly depth: number
  /** 这一层维度上的取值；根为 null。 */
  readonly value: unknown
  /** 叶子的度量值；内部节点为 undefined。 */
  readonly size?: number
}

/** 层级图的数据：扁平的节点表，次序是父在子前。 */
export interface HierarchyChartData {
  readonly type: 'hierarchy'
  readonly nodes: readonly HierarchyNodeData[]
}

/** 交给图表渲染的数据，形状随图表类型。 */
export type ChartData = CartesianChartData | RowsChartData | SankeyChartData | DateHeatmapData | MatrixHeatmapData | HierarchyChartData

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function seriesMeasures(spec: CartesianSeriesSpec, dimensions: ReadonlySet<string>): string[] {
  const fields: string[] = []
  const add = (field: string | undefined): void => {
    if (field !== undefined && !dimensions.has(field) && !fields.includes(field))
      fields.push(field)
  }
  if (typeof spec.y === 'string')
    add(spec.y)
  else
    spec.y.forEach(add)
  if (spec.mark === 'scatter') {
    add(spec.x)
    add(spec.size)
    add(spec.color)
  }
  return fields
}

function cartesianData(chart: CartesianChartSpec, query: ReportQuery, result: QueryResult): CartesianChartData {
  const dimensions = new Set(query.dimensions.map(dimension => dimension.id))
  const split = chart.splitBy
  if (split === undefined) {
    const series = chart.series.map(spec => ({
      id: spec.id,
      spec,
      fields: Object.fromEntries(seriesMeasures(spec, dimensions).map(field => [field, field])),
    }))
    return { type: 'cartesian', rows: result.rows, series }
  }
  const measures = [...new Set(chart.series.flatMap(spec => seriesMeasures(spec, dimensions)))]
  const keys = query.dimensions.map(dimension => dimension.id).filter(id => id !== split)
  const columnName = (member: unknown, field: string): string => JSON.stringify([field, valueKey(member)])
  const pivot = pivotWider(result.rows, { key: keys, by: split, value: measures, columnName })
  const members = pivot.columns.filter(column => column.field === measures[0]).map(column => column.member)
  const series = chart.series.flatMap(spec => members.map(member => ({
    id: `${spec.id}:${valueKey(member)}`,
    spec,
    member: { value: member },
    fields: Object.fromEntries(seriesMeasures(spec, dimensions).map(field => [field, columnName(member, field)])),
  })))
  return { type: 'cartesian', rows: pivot.rows, series }
}

function sankeyData(chart: SankeyChartSpec, result: QueryResult): SankeyChartData {
  const nodes = new Map<string, unknown>()
  const links: { source: string, target: string, value: number }[] = []
  const node = (value: unknown): string => {
    const id = valueKey(value)
    if (!nodes.has(id))
      nodes.set(id, value)
    return id
  }
  for (const row of result.rows) {
    const value = row[chart.valueField]
    if (!finite(value) || isMissing(row[chart.sourceField]) || isMissing(row[chart.targetField]))
      continue
    links.push({ source: node(row[chart.sourceField]), target: node(row[chart.targetField]), value })
  }
  return { type: 'sankey', nodes: [...nodes].map(([id, value]) => ({ id, value })), links }
}

function heatmapData(chart: HeatmapChartSpec, result: QueryResult): DateHeatmapData | MatrixHeatmapData {
  if (chart.variant !== 'matrix') {
    const cells: { date: string, count: number }[] = []
    for (const row of result.rows) {
      const date = row[chart.dateField]
      const count = row[chart.valueField]
      if (typeof date === 'string' && finite(count))
        cells.push({ date, count })
    }
    return { type: 'heatmap', variant: chart.variant, cells }
  }
  const rows = new Map<string, unknown>()
  const columns = new Map<string, unknown>()
  const cells: { row: string, column: string, value: number }[] = []
  for (const row of result.rows) {
    const value = row[chart.valueField]
    const rowId = valueKey(row[chart.rowField])
    const columnId = valueKey(row[chart.columnField])
    if (!rows.has(rowId))
      rows.set(rowId, row[chart.rowField])
    if (!columns.has(columnId))
      columns.set(columnId, row[chart.columnField])
    if (finite(value))
      cells.push({ row: rowId, column: columnId, value })
  }
  return {
    type: 'heatmap',
    variant: 'matrix',
    rows: [...rows].map(([id, member]) => ({ id, value: member })),
    columns: [...columns].map(([id, member]) => ({ id, value: member })),
    cells,
  }
}

function hierarchyData(chart: HierarchyChartSpec, result: QueryResult): HierarchyChartData {
  const root = tupleKey([])
  const nodes: HierarchyNodeData[] = [{ id: root, parent: null, depth: 0, value: null }]
  const seen = new Set([root])
  for (const row of result.rows) {
    const path: string[] = []
    let parent = root
    chart.levels.forEach((level, index) => {
      path.push(valueKey(row[level]))
      const id = tupleKey(path)
      const leaf = index === chart.levels.length - 1
      if (!seen.has(id)) {
        seen.add(id)
        const size = row[chart.valueField]
        nodes.push(leaf && finite(size) ? { id, parent, depth: index + 1, value: row[level], size } : { id, parent, depth: index + 1, value: row[level] })
      }
      parent = id
    })
  }
  return { type: 'hierarchy', nodes }
}

/**
 * 把查询结果整成图表的数据。
 * - 直角坐标：没有 splitBy 时查询行原样使用；有 splitBy 时按其余维度合行，系列规格里的度量按拆分维度的每个成员各展开一条系列。
 * - 饼图、漏斗图、雷达图：查询行原样使用。
 * - 桑基图：源与目标维度的取值是节点（同值即同节点，id 为取值的身份编码），度量缺失或不是有限数的行不画。
 * - 热力图：日期变体每天一格（日期维度须按 day 取键）；矩阵变体的行列按首次出现的次序。
 * - 层级图：各层维度的取值组成路径，同一路径是同一个节点，叶子带度量值；另加一个根节点。
 */
export function chartData(chart: ChartSpec, query: ReportQuery, result: QueryResult): ChartData {
  switch (chart.type) {
    case 'cartesian':
      return cartesianData(chart, query, result)
    case 'pie':
    case 'funnel':
    case 'radar':
      return { type: chart.type, rows: result.rows }
    case 'sankey':
      return sankeyData(chart, result)
    case 'heatmap':
      return heatmapData(chart, result)
    case 'hierarchy':
      return hierarchyData(chart, result)
  }
}
