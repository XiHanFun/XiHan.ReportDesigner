/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 卡片上能作联动源的维度：图表与指标卡片是查询的维度，表格卡片按视图类型是明细表的列、分组报表的分组、交叉表的行列维度。

import type { DashboardCard } from '@xihan-report/core'

/** 能作联动源的维度，按卡片里的先后；卡片不存在时为空。 */
export function linkableDimensions(card: DashboardCard | undefined): readonly { readonly id: string, readonly title?: string, readonly field?: string }[] {
  if (!card)
    return []
  if (card.kind !== 'table')
    return card.query.dimensions
  const view = card.view
  return view.type === 'table' ? view.columns : view.type === 'group' ? view.groups : [...view.rows, ...view.columns]
}
