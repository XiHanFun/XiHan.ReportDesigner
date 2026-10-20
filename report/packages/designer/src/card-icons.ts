/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 内置卡片种类的图标：物料与页面结构共用一张表。

import type { ReportCardType } from '@xihan-report/core'
import type { IconRecord } from '@xihan-ui/core'
import { ChartBarIcon, ChartFunnelIcon, ChartHeatmapIcon, ChartPieIcon, ChartRadarIcon, ChartSankeyIcon, ChartTreemapIcon, GridIcon, TableGroupIcon, TableIcon, TrendingUpIcon } from '@xihan-ui/icons'

/** 内置卡片种类的图标，图标集见 @xihan-ui/icons；扩展的卡片种类不在其中。 */
export const REPORT_CARD_TYPE_ICONS: Readonly<Record<ReportCardType, IconRecord>> = {
  'chart.cartesian': ChartBarIcon,
  'chart.pie': ChartPieIcon,
  'chart.funnel': ChartFunnelIcon,
  'chart.radar': ChartRadarIcon,
  'chart.sankey': ChartSankeyIcon,
  'chart.heatmap': ChartHeatmapIcon,
  'chart.hierarchy': ChartTreemapIcon,
  'metric': TrendingUpIcon,
  'table.table': TableIcon,
  'table.group': TableGroupIcon,
  'table.crosstab': GridIcon,
}
