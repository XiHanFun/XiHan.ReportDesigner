/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 取回的数据交给 core 计算：明细表、分组报表与交叉表按视图类型算，卡片与扩展视图按种类算。

import type { ReportKindInput } from '../extensions'
import type { CrosstabView, DashboardCard, DatasetData, DatasetSchema, DataView, ExtensionView, GroupView, TableView } from '../schema'
import type { ComputeOptions } from './context'
import type { CrosstabResult } from './crosstab'
import type { GroupReportResult, TableResult } from './table'
import { bodyQuery, cardQuery, cardView } from '../card-data'
import { createReportModel } from '../extensions'
import { buildCrosstab } from './crosstab'
import { ReportComputeError } from './errors'
import { runQuery } from './query'
import { buildGroupReport, buildTable } from './table'

/** 一个数据视图的计算结果。 */
export type ViewResult
  = | { readonly type: 'table', readonly view: TableView, readonly dataset: DatasetSchema, readonly result: TableResult }
    | { readonly type: 'group', readonly view: GroupView, readonly dataset: DatasetSchema, readonly result: GroupReportResult }
    | { readonly type: 'crosstab', readonly view: CrosstabView, readonly dataset: DatasetSchema, readonly result: CrosstabResult }

/** 按视图类型计算明细表、分组报表或交叉表。 */
export function computeView(view: DataView, dataset: DatasetSchema, data: DatasetData, options: ComputeOptions = {}): ViewResult {
  switch (view.type) {
    case 'table':
      return { type: 'table', view, dataset, result: buildTable(view, dataset, data, options) }
    case 'group':
      return { type: 'group', view, dataset, result: buildGroupReport(view, dataset, data, options) }
    case 'crosstab':
      return { type: 'crosstab', view, dataset, result: buildCrosstab(view, dataset, data, options) }
  }
}

/** 一张卡片的计算结果：value 的形状由种类定，内置的图表是 ChartData、指标是 MetricValue、表格是 ViewResult。 */
export interface CardResult {
  readonly card: DashboardCard
  readonly dataset: DatasetSchema | undefined
  readonly value: unknown
}

/** 作主体的扩展视图的计算结果：value 的形状由种类定。 */
export interface ExtensionViewResult {
  readonly view: ExtensionView
  readonly dataset: DatasetSchema | undefined
  readonly value: unknown
}

function requireData(dataset: DatasetSchema | undefined, data: DatasetData | undefined, owner: Readonly<Record<string, unknown>>): { dataset: DatasetSchema, data: DatasetData } {
  if (dataset === undefined || data === undefined)
    throw new ReportComputeError('missing-data', owner)
  return { dataset, data }
}

/**
 * 按种类计算一张卡片：先按取数形状跑查询或视图，再交给种类的 compute。不取数的卡片 dataset 与 data 传 undefined。
 * 种类没有登记时抛 ReportComputeError('unknown-kind')，取数的卡片没给数据时抛 missing-data。
 */
export function computeCard(card: DashboardCard, dataset: DatasetSchema | undefined, data: DatasetData | undefined, options: ComputeOptions = {}): CardResult {
  const entry = createReportModel(options.extensions).cards.get(card.kind)
  if (!entry)
    throw new ReportComputeError('unknown-kind', { card: card.id, kind: card.kind })
  const view = cardView(card)
  const query = cardQuery(card)
  let input: ReportKindInput = { dataset }
  if (view) {
    const source = requireData(dataset, data, { card: card.id })
    input = { dataset, view: computeView(view, source.dataset, source.data, options) }
  }
  else if (query) {
    const source = requireData(dataset, data, { card: card.id })
    input = { dataset, query: runQuery(query.query, source.dataset, source.data, options) }
  }
  const value = entry.kind.compute ? entry.kind.compute(card, input) : (input.view ?? input.query)
  return { card, dataset, value }
}

/** 按种类计算作主体的扩展视图，规则同 computeCard。 */
export function computeExtensionView(view: ExtensionView, dataset: DatasetSchema | undefined, data: DatasetData | undefined, options: ComputeOptions = {}): ExtensionViewResult {
  const entry = createReportModel(options.extensions).views.get(view.type)
  if (!entry)
    throw new ReportComputeError('unknown-kind', { view: view.type, kind: view.type })
  const query = bodyQuery(view)
  let input: ReportKindInput = { dataset }
  if (query) {
    const source = requireData(dataset, data, { view: view.type })
    input = { dataset, query: runQuery(query.query, source.dataset, source.data, options) }
  }
  const value = entry.kind.compute ? entry.kind.compute(view, input) : input.query
  return { view, dataset, value }
}
