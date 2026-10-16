/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 看板卡片与网格项互换：布局算法用 @xihan-ui/designer-kit 的网格布局，这里取出卡片位置、把布局变化写成编辑操作。

import type { GridItem } from '@xihan-ui/designer-kit'
import type { ReportOperation } from './operations'
import type { DashboardView } from './schema'

/** 看板上全部卡片的网格位置，次序与卡片相同。 */
export function gridItems(dashboard: DashboardView): GridItem[] {
  return dashboard.cards.map(card => ({ id: card.id, ...card.layout }))
}

/**
 * 把布局的变化写成一条 layoutCards：before 里有、位置大小变了的卡片；没有变化时为空数组。
 * 新增与移除的卡片不在其中，由调用方另行新增或删除卡片。
 */
export function layoutOperations(before: readonly GridItem[], after: readonly GridItem[]): ReportOperation[] {
  const previous = new Map(before.map(item => [item.id, item]))
  const layouts: Record<string, { x: number, y: number, w: number, h: number }> = {}
  for (const item of after) {
    const old = previous.get(item.id)
    if (!old || (old.x === item.x && old.y === item.y && old.w === item.w && old.h === item.h))
      continue
    layouts[item.id] = { x: item.x, y: item.y, w: item.w, h: item.h }
  }
  return Object.keys(layouts).length === 0 ? [] : [{ type: 'layoutCards', layouts }]
}
