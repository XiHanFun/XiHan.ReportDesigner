/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 图表与指标卡片的绑定补全：必填的引用留空或指着已不存在的维度、度量时，按查询里现有的项依次填上。

import type { JsonPath } from '@xihan-ui/core/json'
import type { PropertyChange, ReportOperation } from './operations'
import type { CartesianSeriesSpec, ChartSpec, DashboardCard, JsonValue, MetricSpec, ReportDocument } from './schema'
import { nextFreeId } from '@xihan-ui/designer-kit'

/** 雷达图指标数的上限。 */
const MAX_INDICATORS = 10

/** 一类候选项：按次序取第一个没被占用的。 */
class Pool {
  readonly #keys: readonly string[]
  readonly #taken = new Set<string>()

  constructor(keys: readonly string[]) {
    this.#keys = keys
  }

  has(key: unknown): key is string {
    return typeof key === 'string' && this.#keys.includes(key)
  }

  /** 已绑定且有效的引用记为占用。 */
  hold(key: unknown): void {
    if (this.has(key))
      this.#taken.add(key)
  }

  /** 第一个没被占用的项，没有时取第一个；一项都没有时为 undefined。 */
  next(): string | undefined {
    const key = this.#keys.find(item => !this.#taken.has(item)) ?? this.#keys[0]
    if (key !== undefined)
      this.#taken.add(key)
    return key
  }

  get keys(): readonly string[] {
    return this.#keys
  }
}

function fillChart(chart: ChartSpec, dimensions: Pool, measures: Pool, change: (path: JsonPath, value: JsonValue) => void): void {
  /** 依次填一组同类的必填引用：先把有效的记为占用，再给无效的取下一个候选。 */
  const fill = (pool: Pool, slots: readonly (readonly [JsonPath, unknown])[]): void => {
    for (const [, key] of slots)
      pool.hold(key)
    for (const [path, key] of slots) {
      if (pool.has(key))
        continue
      const next = pool.next()
      if (next !== undefined)
        change(['chart', ...path], next)
    }
  }
  switch (chart.type) {
    case 'pie':
    case 'funnel':
      fill(dimensions, [[['nameField'], chart.nameField]])
      fill(measures, [[['valueField'], chart.valueField]])
      break
    case 'radar':
      fill(dimensions, [[['nameField'], chart.nameField]])
      if (chart.indicators.length === 0 && measures.keys.length > 0)
        change(['chart', 'indicators'], measures.keys.slice(0, MAX_INDICATORS).map(key => ({ key })))
      break
    case 'sankey':
      fill(dimensions, [[['sourceField'], chart.sourceField], [['targetField'], chart.targetField]])
      fill(measures, [[['valueField'], chart.valueField]])
      break
    case 'heatmap':
      fill(dimensions, chart.variant === 'matrix' ? [[['rowField'], chart.rowField], [['columnField'], chart.columnField]] : [[['dateField'], chart.dateField]])
      fill(measures, [[['valueField'], chart.valueField]])
      break
    case 'hierarchy':
      if (chart.levels.length === 0 && dimensions.keys.length > 0)
        change(['chart', 'levels'], [...dimensions.keys])
      fill(measures, [[['valueField'], chart.valueField]])
      break
    case 'cartesian': {
      const x = dimensions.keys[0]
      if (x === undefined)
        break
      if (chart.series.length === 0) {
        const taken = new Set<string>()
        const series: CartesianSeriesSpec[] = measures.keys.map((y) => {
          const id = taken.has(y) ? nextFreeId(y, taken) : y
          taken.add(id)
          return { id, mark: 'bar', x, y }
        })
        if (series.length > 0)
          change(['chart', 'series'], series as unknown as JsonValue)
        break
      }
      chart.series.forEach((series, index) => {
        if (!dimensions.has(series.x))
          change(['chart', 'series', index, 'x'], x)
      })
      break
    }
  }
}

function fillMetric(metric: MetricSpec, measures: Pool, change: (path: JsonPath, value: JsonValue) => void): void {
  if (measures.has(metric.value))
    return
  const next = measures.next()
  if (next !== undefined)
    change(['metric', 'value'], next)
}

/**
 * 补全一张图表或指标卡片的必填绑定：留空（空字符串）或指着查询里已没有的维度、度量的引用，按查询里的项依次填上，
 * 同类的几处引用尽量取不同的项（桑基图的源与目标、矩阵热力图的行与列）。空列表的雷达图指标取全部度量（至多 10 个），
 * 层级图的层取全部维度，柱线图的系列为每个度量建一条柱系列、横轴取第一个维度；已有系列的横轴无效时换成第一个维度。
 * 可选引用不动。没有要补的、卡片是表格卡片或主体不是看板时为空数组；卡片不存在时抛 RangeError。
 */
export function planFillBindings(document: ReportDocument, card: string): ReportOperation[] {
  const body = document.body
  if (body.type !== 'dashboard')
    return []
  const target: DashboardCard | undefined = body.cards.find(item => item.id === card)
  if (!target)
    throw new RangeError(`[report] unknown card ${card}`)
  if (target.kind !== 'chart' && target.kind !== 'metric')
    return []
  const dimensions = new Pool(target.query.dimensions.map(item => item.id))
  const measures = new Pool(target.query.measures.map(item => item.id))
  const changes: PropertyChange[] = []
  const change = (path: JsonPath, value: JsonValue): void => {
    changes.push({ path, value })
  }
  if (target.kind === 'chart')
    fillChart(target.chart, dimensions, measures, change)
  else
    fillMetric(target.metric, measures, change)
  return changes.length === 0 ? [] : [{ type: 'updateCard', id: card, changes }]
}
