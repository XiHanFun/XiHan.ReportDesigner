/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表运行时的内建文案：查看器与 xlsx 导出共用一份，类型补进 UI 的 XhTranslationOverrides。

/** 查看器的内建文案。 */
export interface ReportViewerTranslations {
  /** 查看器的可及名。 */
  readonly label: string
  readonly loading: string
  /** 没有数据时的提示。 */
  readonly empty: string
  /** 取数或计算失败时的提示。 */
  readonly error: string
  /** 报表定义有问题、不能显示时的提示。 */
  readonly invalid: string
  /** 报表参数缺少或取值不合格时的提示。 */
  readonly parametersInvalid: string
  /** 暂不支持的卡片或图表类型。 */
  readonly unsupported: string
  /** 总计行、总计列的标签。 */
  readonly total: string
  /** 小计行、小计列的标签。 */
  readonly subtotal: string
  /** 缺失值成员的显示文字。 */
  readonly missing: string
  /** 参数栏的可及名。 */
  readonly parameters: string
  /** 清除联动选中的按钮。 */
  readonly clearSelections: string
}

/** 内建英文文案。 */
export const DEFAULT_REPORT_VIEWER_TRANSLATIONS: ReportViewerTranslations = {
  label: 'Report',
  loading: 'Loading…',
  empty: 'No data',
  error: 'Failed to load data',
  invalid: 'This report definition has problems and cannot be shown',
  parametersInvalid: 'Some report parameters are missing or invalid',
  unsupported: 'This view is not supported yet',
  total: 'Total',
  subtotal: 'Subtotal',
  missing: '(Blank)',
  parameters: 'Report parameters',
  clearSelections: 'Clear selections',
}

declare module '@xihan-ui/web-components' {
  interface XhTranslationOverrides {
    'xh-report-viewer'?: Partial<ReportViewerTranslations>
  }
}
