/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 物料面板的内容：卡片种类按图表、指标、表格分三组；条目的 id 与 payload 都是卡片种类。

import type { ReportCardType } from '@xihan-report/core'
import type { ReportDesignerTranslations } from '@xihan-report/runtime'
import type { DesignerPaletteDragPayload, DesignerPaletteGroup } from '@xihan-ui/designer-shell'
import { REPORT_CARD_TYPES } from '@xihan-report/core'

const GROUPS = ['charts', 'metrics', 'tables'] as const

function groupOf(type: ReportCardType): (typeof GROUPS)[number] {
  return type === 'metric' ? 'metrics' : type.startsWith('chart.') ? 'charts' : 'tables'
}

/** 物料分组：标题取 paletteGroups，条目名取 cardTypes，缺文案时显示键名。 */
export function paletteGroups(t: ReportDesignerTranslations): DesignerPaletteGroup[] {
  return GROUPS.map(group => ({
    id: group,
    label: t.paletteGroups[group] ?? group,
    items: REPORT_CARD_TYPES.filter(type => groupOf(type) === group).map(type => ({ id: type, label: t.cardTypes[type] ?? type, payload: type })),
  }))
}

/** 物料面板拖出的卡片种类；不是物料面板的载荷时为 undefined。 */
export function paletteCardType(payload: unknown): ReportCardType | undefined {
  const drag = payload as Partial<DesignerPaletteDragPayload> | undefined
  return drag?.source === 'palette' && REPORT_CARD_TYPES.includes(drag.payload as ReportCardType) ? drag.payload as ReportCardType : undefined
}
