/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表设计器的内建文案；类型补进 UI 的 XhTranslationOverrides。几张对照表（属性名、选项、卡片种类等）按键整份覆盖。

/** 问题文案的入参：校验问题的码与参数。 */
export interface ReportDesignerIssueDetails {
  readonly code: string
  readonly params?: Readonly<Record<string, unknown>>
}

/** 设计器的内建文案。 */
export interface ReportDesignerTranslations {
  /** 设计器的可及名。 */
  readonly label: string
  readonly toolbar: string
  readonly canvas: string
  readonly undo: string
  readonly redo: string
  readonly delete: string
  readonly copy: string
  readonly cut: string
  readonly paste: string
  readonly duplicate: string
  readonly design: string
  readonly preview: string
  /** 数据面板的标题与分组。 */
  readonly data: string
  readonly datasets: string
  readonly parameters: string
  /** 字段栏的标题。 */
  readonly wells: string
  /** 字段栏各列表的名字：dimensions、measures、series、rows、columns（交叉表的列维度）、groups、tableColumns（明细表与分组报表的列）。 */
  readonly lists: Readonly<Record<string, string>>
  /** 物料分组：charts、metrics、tables。 */
  readonly paletteGroups: Readonly<Record<string, string>>
  /** 物料与卡片种类：chart.<图表类型>、metric、table.<视图类型>。 */
  readonly cardTypes: Readonly<Record<string, string>>
  /** 属性面板标题下的对象种类。 */
  readonly objectKinds: Readonly<Record<string, string>>
  /** 属性分组名，键同 REPORT_PROPERTY_GROUPS。 */
  readonly propertyGroups: Readonly<Record<string, string>>
  /** 属性名：键为 formatJsonPath(path)，也可写 `<对象种类>:<路径>` 覆盖。 */
  readonly propertyLabels: Readonly<Record<string, string>>
  /** 下拉选项：键为 `<路径>=<值>`，没有时再找 `<值>`。 */
  readonly optionLabels: Readonly<Record<string, string>>
  /** 多个对象选中时的标题。 */
  readonly selected: (count: number) => string
  /** 看板上还没有卡片时的提示。 */
  readonly emptyDashboard: string
  /** 字段栏的空列表提示。 */
  readonly emptyList: string
  /** 没给取数回调时卡片上的占位说明。 */
  readonly placeholder: string
  /** 问题说明。 */
  readonly issue: (issue: ReportDesignerIssueDetails) => string
}

const CHART_TYPES: Readonly<Record<string, string>> = {
  'chart.cartesian': 'Bar / line chart',
  'chart.pie': 'Pie chart',
  'chart.funnel': 'Funnel chart',
  'chart.radar': 'Radar chart',
  'chart.sankey': 'Sankey diagram',
  'chart.heatmap': 'Heatmap',
  'chart.hierarchy': 'Hierarchy chart',
  'metric': 'Metric',
  'table.table': 'Detail table',
  'table.group': 'Grouped report',
  'table.crosstab': 'Crosstab',
}

function issueText(issue: ReportDesignerIssueDetails): string {
  const key = issue.params?.key ?? issue.params?.field ?? issue.params?.card ?? issue.params?.dataset ?? issue.params?.parameter ?? issue.params?.series
  const subject = key === undefined ? '' : ` "${String(key)}"`
  switch (issue.code) {
    case 'required':
      return 'This value is required'
    case 'empty':
      return 'This value cannot be empty'
    case 'duplicate-key':
      return 'Duplicate name'
    case 'unknown-dataset':
      return `Unknown dataset${subject}`
    case 'unknown-field':
      return `Unknown field${subject}`
    case 'unknown-dimension':
      return `Unknown dimension${subject}`
    case 'unknown-measure':
      return `Unknown measure${subject}`
    case 'unknown-card':
      return `Unknown card${subject}`
    case 'unknown-parameter':
      return `Unknown parameter${subject}`
    case 'unknown-series':
      return `Unknown series${subject}`
    case 'layout-overlap':
      return 'Cards overlap'
    case 'layout-out-of-bounds':
      return 'The card is outside the grid'
    case 'formula-invalid':
      return 'The formula cannot be parsed'
    case 'formula-cycle':
      return 'Formulas reference each other in a cycle'
    case 'format-invalid':
      return 'The format is invalid'
    default:
      return `Problem: ${issue.code}`
  }
}

/** 内建英文文案。 */
export const DEFAULT_REPORT_DESIGNER_TRANSLATIONS: ReportDesignerTranslations = {
  label: 'Report designer',
  toolbar: 'Designer actions',
  canvas: 'Canvas',
  undo: 'Undo',
  redo: 'Redo',
  delete: 'Delete',
  copy: 'Copy',
  cut: 'Cut',
  paste: 'Paste',
  duplicate: 'Duplicate',
  design: 'Design',
  preview: 'Preview',
  data: 'Data',
  datasets: 'Datasets',
  parameters: 'Parameters',
  wells: 'Fields',
  lists: { dimensions: 'Dimensions', measures: 'Measures', series: 'Series', rows: 'Rows', columns: 'Columns', groups: 'Groups', tableColumns: 'Columns' },
  paletteGroups: { charts: 'Charts', metrics: 'Metrics', tables: 'Tables' },
  cardTypes: CHART_TYPES,
  objectKinds: {
    document: 'Report',
    dashboard: 'Dashboard',
    card: 'Card',
    chart: 'Chart',
    metric: 'Metric',
    view: 'View',
    dimension: 'Dimension',
    measure: 'Measure',
    column: 'Column',
    group: 'Group',
    series: 'Series',
    field: 'Field',
    parameter: 'Parameter',
    link: 'Link',
  },
  propertyGroups: { basic: 'General', data: 'Data', display: 'Display', axis: 'Axes', style: 'Style', interaction: 'Interaction', totals: 'Totals', sparkline: 'Sparkline' },
  propertyLabels: {},
  optionLabels: {},
  selected: count => `${count} selected`,
  emptyDashboard: 'Drag a chart, metric or table here',
  emptyList: 'Drop fields here',
  placeholder: 'Sample data appears when a data provider is set',
  issue: issueText,
}

declare module '@xihan-ui/web-components' {
  interface XhTranslationOverrides {
    'xh-report-designer'?: Partial<ReportDesignerTranslations>
  }
}
