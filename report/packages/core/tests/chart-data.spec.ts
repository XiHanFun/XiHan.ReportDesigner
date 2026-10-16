/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { CartesianChartData, ChartSpec, HierarchyChartData, MatrixHeatmapData, ReportQuery, SankeyChartData } from '../src'
import { describe, expect, it } from 'vitest'
import { chartData, runQuery } from '../src'
import { salesData, salesDataset } from './fixtures'

function shape(chart: ChartSpec, query: ReportQuery): ReturnType<typeof chartData> {
  return chartData(chart, query, runQuery(query, salesDataset, salesData))
}

const byRegionProduct: ReportQuery = {
  dimensions: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }],
  measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }, { id: 'qty', aggregate: 'sum', field: 'qty' }],
}

describe('chartData：直角坐标', () => {
  it('没有 splitBy 时查询行原样使用，系列的度量列名就是度量 id', () => {
    const query: ReportQuery = { dimensions: [{ id: 'region', field: 'region' }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] }
    const data = shape({ type: 'cartesian', series: [{ id: 's', mark: 'bar', x: 'region', y: 'amount' }] }, query) as CartesianChartData
    expect(data.rows).toEqual(runQuery(query, salesDataset, salesData).rows)
    expect(data.series).toEqual([{ id: 's', spec: { id: 's', mark: 'bar', x: 'region', y: 'amount' }, fields: { amount: 'amount' } }])
  })

  it('splitBy 按其余维度合行，每条系列按拆分成员各展开一条', () => {
    const chart: ChartSpec = {
      type: 'cartesian',
      splitBy: 'product',
      series: [{ id: 'sum', mark: 'bar', x: 'region', y: 'amount' }, { id: 'count', mark: 'line', x: 'region', y: 'qty' }],
    }
    const data = shape(chart, byRegionProduct) as CartesianChartData
    expect(data.rows.map(row => row.region)).toEqual(['East', 'West', null])
    expect(data.series.map(series => series.id)).toEqual(['sum:$A', 'sum:$B', 'count:$A', 'count:$B'])
    const east = data.rows[0]!
    const [sumA, sumB, countA] = data.series
    expect(east[sumA!.fields.amount!]).toBe(130)
    expect(east[sumB!.fields.amount!]).toBe(50)
    expect(east[countA!.fields.qty!]).toBe(5)
    expect(sumA!.member).toEqual({ value: 'A' })
    expect(data.rows[2]).not.toHaveProperty(sumB!.fields.amount!)
  })

  it('散点的横坐标、大小与颜色是度量时也随拆分展开', () => {
    const chart: ChartSpec = { type: 'cartesian', splitBy: 'product', series: [{ id: 'p', mark: 'scatter', x: 'qty', y: 'amount', size: 'qty' }] }
    const data = shape(chart, byRegionProduct) as CartesianChartData
    expect(Object.keys(data.series[0]!.fields)).toEqual(['amount', 'qty'])
  })
})

describe('chartData：其它图表', () => {
  it('饼图、漏斗图、雷达图原样使用查询行', () => {
    const query: ReportQuery = { dimensions: [{ id: 'product', field: 'product' }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] }
    const rows = runQuery(query, salesDataset, salesData).rows
    expect(shape({ type: 'pie', nameField: 'product', valueField: 'amount' }, query)).toEqual({ type: 'pie', rows })
    expect(shape({ type: 'radar', nameField: 'product', indicators: [{ key: 'amount' }] }, query)).toEqual({ type: 'radar', rows })
  })

  it('桑基图：同值即同节点，度量缺失的行不画', () => {
    const data = shape({ type: 'sankey', sourceField: 'region', targetField: 'product', valueField: 'amount' }, byRegionProduct) as SankeyChartData
    expect(data.nodes.map(node => node.value)).toEqual(['East', 'A', 'B', 'West'])
    expect(data.links).toEqual([
      { source: '$East', target: '$A', value: 130 },
      { source: '$East', target: '$B', value: 50 },
      { source: '$West', target: '$A', value: 80 },
    ])
  })

  it('日期热力图每天一格，矩阵热力图的行列按首次出现的次序', () => {
    const daily: ReportQuery = { dimensions: [{ id: 'day', field: 'date', bucket: 'day' }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] }
    expect(shape({ type: 'heatmap', variant: 'calendar', dateField: 'day', valueField: 'amount' }, daily)).toEqual({
      type: 'heatmap',
      variant: 'calendar',
      cells: [
        { date: '2026-01-15', count: 100 },
        { date: '2026-01-20', count: 80 },
        { date: '2026-02-03', count: 50 },
        { date: '2026-03-01', count: 20 },
        { date: '2026-03-05', count: 30 },
      ],
    })
    const matrix = shape({ type: 'heatmap', variant: 'matrix', rowField: 'region', columnField: 'product', valueField: 'amount' }, byRegionProduct) as MatrixHeatmapData
    expect(matrix.rows.map(row => row.value)).toEqual(['East', 'West', null])
    expect(matrix.columns.map(column => column.value)).toEqual(['A', 'B'])
    expect(matrix.cells).toContainEqual({ row: '$East', column: '$B', value: 50 })
  })

  it('层级图：路径相同即同一节点，父在子前，叶子带度量值', () => {
    const data = shape({ type: 'hierarchy', levels: ['region', 'product'], valueField: 'amount' }, byRegionProduct) as HierarchyChartData
    const root = data.nodes[0]!
    expect(root).toEqual({ id: '[]', parent: null, depth: 0, value: null })
    const east = data.nodes.find(node => node.depth === 1 && node.value === 'East')!
    expect(data.nodes.filter(node => node.parent === east.id).map(node => [node.value, node.size])).toEqual([['A', 130], ['B', 50]])
    const ids = data.nodes.map(node => node.id)
    expect(data.nodes.every(node => node.parent === null || ids.indexOf(node.parent) < ids.indexOf(node.id))).toBe(true)
  })
})
