/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 卡片的绑定补全：交给卡片种类的 fillBindings，按查询里现有的维度与度量填上必填的引用。

import type { ReportCoreExtension } from './extensions'
import type { ReportOperation } from './operations'
import type { DashboardCard, ReportDocument } from './schema'
import { cardQuery } from './card-data'
import { createReportModel } from './extensions'

/** 补全绑定的选项。 */
export interface FillBindingsOptions {
  /** 登记了卡片种类的扩展；扩展卡片的补全取自它的种类。 */
  readonly extensions?: readonly ReportCoreExtension[]
}

/**
 * 补全一张卡片的必填绑定：取数形状为 query 的卡片交给它种类的 fillBindings，拿到查询里现有的维度与度量 id。
 * 内置的图表卡片补留空或指着已没有的维度、度量的必填引用（同类的几处尽量取不同的项；空的雷达图指标取全部度量，至多 10 个；
 * 空的层级图层取全部维度；空的柱线图每个度量建一条柱系列、横轴取第一个维度），指标卡片补指标的数值。
 * 种类没给 fillBindings、没登记、卡片不取查询、没有要补的或主体不是看板时为空数组；卡片不存在时抛 RangeError。
 */
export function planFillBindings(document: ReportDocument, card: string, options: FillBindingsOptions = {}): ReportOperation[] {
  const body = document.body
  if (body.type !== 'dashboard')
    return []
  const target: DashboardCard | undefined = body.cards.find(item => item.id === card)
  if (!target)
    throw new RangeError(`[report] unknown card ${card}`)
  const query = cardQuery(target)
  const fill = createReportModel(options.extensions).cards.get(target.kind)?.kind.fillBindings
  if (!query || !fill)
    return []
  const changes = fill(target, { dimensions: query.query.dimensions.map(item => item.id), measures: query.query.measures.map(item => item.id) })
  return changes.length === 0 ? [] : [{ type: 'updateCard', id: card, changes: [...changes] }]
}
