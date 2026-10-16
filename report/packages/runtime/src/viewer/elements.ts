/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 查看器排出的 UI 元素：逐个按需注册，只有这些元素类进打包结果。

import {
  defineXhElement,
  XhButtonElement,
  XhCartesianChartElement,
  XhDateFieldElement,
  XhFunnelChartElement,
  XhHeatmapElement,
  XhHierarchyChartElement,
  XhNumberFieldElement,
  XhPieChartElement,
  XhRadarChartElement,
  XhSankeyChartElement,
  XhSelectElement,
  XhSparklineElement,
  XhStatisticElement,
  XhSwitchElement,
  XhTableElement,
  XhTagsInputElement,
  XhTextFieldElement,
  XhVirtualizerElement,
} from '@xihan-ui/web-components/define'

/** 注册查看器用到的 UI 元素：表格、虚拟列表、各类图表、指标卡与参数栏的表单元素；同一版本重复注册不报错。 */
export function defineViewerElements(): void {
  defineXhElement('xh-table', XhTableElement)
  defineXhElement('xh-virtualizer', XhVirtualizerElement)
  defineXhElement('xh-cartesian-chart', XhCartesianChartElement)
  defineXhElement('xh-pie-chart', XhPieChartElement)
  defineXhElement('xh-funnel-chart', XhFunnelChartElement)
  defineXhElement('xh-radar-chart', XhRadarChartElement)
  defineXhElement('xh-sankey-chart', XhSankeyChartElement)
  defineXhElement('xh-hierarchy-chart', XhHierarchyChartElement)
  defineXhElement('xh-heatmap', XhHeatmapElement)
  defineXhElement('xh-statistic', XhStatisticElement)
  defineXhElement('xh-sparkline', XhSparklineElement)
  defineXhElement('xh-select', XhSelectElement)
  defineXhElement('xh-switch', XhSwitchElement)
  defineXhElement('xh-date-field', XhDateFieldElement)
  defineXhElement('xh-tags-input', XhTagsInputElement)
  defineXhElement('xh-number-field', XhNumberFieldElement)
  defineXhElement('xh-text-field', XhTextFieldElement)
  defineXhElement('xh-button', XhButtonElement)
}
