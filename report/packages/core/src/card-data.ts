/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 读卡片与主体的取数部分：带 view 的（表格卡片，或取数形状为 view 的扩展卡片）、带 dataset 与 query 的
// （图表与指标卡片，或取数形状为 query 的扩展卡片与扩展视图），或不取数。按结构读，种类声明的形状由校验保证。

import type { DashboardCard, DataBinding, DataView, ReportBody, ReportQuery } from './schema'
import { isPlainObject } from '@xihan-ui/core/json'

/** 带查询的取数部分：数据集、参数绑定与聚合查询。 */
export interface QueryBinding extends DataBinding {
  readonly query: ReportQuery
}

const DATA_VIEW_TYPES: ReadonlySet<unknown> = new Set(['table', 'group', 'crosstab'])

/** 主体是不是明细表、分组报表或交叉表。 */
export function isDataView(body: ReportBody): body is DataView {
  return DATA_VIEW_TYPES.has(body.type)
}

/** 卡片带的视图：表格卡片，或取数形状为 view 的扩展卡片；别的卡片为 undefined。 */
export function cardView(card: DashboardCard): DataView | undefined {
  if (card.kind === 'table')
    return card.view
  if (card.kind === 'chart' || card.kind === 'metric')
    return undefined
  return isPlainObject(card.view) && DATA_VIEW_TYPES.has(card.view.type) ? card.view : undefined
}

/** 卡片的查询：图表与指标卡片，或取数形状为 query 的扩展卡片；别的卡片为 undefined。 */
export function cardQuery(card: DashboardCard): QueryBinding | undefined {
  if (card.kind === 'chart' || card.kind === 'metric')
    return card
  if (card.kind === 'table')
    return undefined
  return typeof card.dataset === 'string' && isPlainObject(card.query) ? card as QueryBinding : undefined
}

/** 扩展视图作主体时的查询：取数形状为 query 的扩展视图；别的主体为 undefined。 */
export function bodyQuery(body: ReportBody): QueryBinding | undefined {
  if (body.type === 'dashboard' || isDataView(body))
    return undefined
  return typeof body.dataset === 'string' && isPlainObject(body.query) ? body as QueryBinding : undefined
}

/** 卡片取数的数据集 id；不取数的卡片为 undefined。 */
export function cardDataset(card: DashboardCard): string | undefined {
  return cardView(card)?.dataset ?? cardQuery(card)?.dataset
}
