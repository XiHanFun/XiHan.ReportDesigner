/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表设计器的内建文案；类型补进 UI 的 XhTranslationOverrides。几张对照表（属性名、选项、卡片种类等）按键整份覆盖。

import type { PARAMETER_ISSUE_CODES, REPORT_ISSUE_CODES, ReportPropertyGroup, ReportStepAction } from '@xihan-report/core'
import type { CommonIssueCode } from '@xihan-ui/designer-kit/schema'

/** 删除数据面板对象时一并删掉的别处的数目。 */
export interface ReportDesignerCascade {
  readonly items: number
  readonly conditions: number
  readonly sorts: number
  readonly links: number
  readonly bindings: number
}

/** 问题文案的入参：校验问题的码与参数。 */
export interface ReportDesignerIssueDetails {
  readonly code: string
  readonly params?: Readonly<Record<string, unknown>>
}

/** 撤销栈里一步的说明素材：对象种类已按语言取好。 */
export interface ReportHistoryStepText {
  readonly action: ReportStepAction
  /** 对象种类的名字，取 objectKinds，如「卡片」。 */
  readonly kind: string
  /** 对象名；只改一个对象时才有。 */
  readonly name?: string
  /** 这一步里同种对象改了几个。 */
  readonly count: number
  /** 改名之后的名字（rename）。 */
  readonly to?: string
  /** 改的那个属性的名字（update，在属性面板里改时）。 */
  readonly property?: string
  /** 连带删掉的引用处数（remove）。 */
  readonly cascade?: number
}

/** 新手引导里报表自己的几步：数据面板、字段栏、卡片、联动与预览。 */
export type ReportTourStepKey = 'datasets' | 'wells' | 'cards' | 'links' | 'preview'

/** 引导一步的标题与说明。 */
export interface ReportTourStepText {
  readonly title: string
  readonly description: string
}

/** 设计器的内建文案。 */
export interface ReportDesignerTranslations {
  /** 设计器的可及名。 */
  readonly label: string
  readonly canvas: string
  /** 数据集与报表参数两块卡片的标题。 */
  readonly datasets: string
  readonly parameters: string
  /** 字段栏的标题。 */
  readonly wells: string
  /** 字段栏各列表的名字：dimensions、measures、series、rows、columns（交叉表的列维度）、groups、tableColumns（明细表与分组报表的列）。 */
  readonly lists: Readonly<Record<string, string>>
  /** 物料面板的标题，也是外框里这个区的名字。 */
  readonly palette: string
  /** 属性面板的标题，也是外框里这个区的名字。 */
  readonly properties: string
  /** 问题列表的标题，也是外框里这个区的名字。 */
  readonly issues: string
  /** 数据集卡片的帮助。 */
  readonly datasetsHelp: string
  /** 报表参数卡片的帮助。 */
  readonly parametersHelp: string
  /** 物料卡片的帮助。 */
  readonly paletteHelp: string
  /** 字段栏卡片的帮助。 */
  readonly wellsHelp: string
  /** 属性卡片的帮助。 */
  readonly propertiesHelp: string
  /** 问题卡片的帮助。 */
  readonly issuesHelp: string
  /** 选中卡片时浮在选中框上方那一条工具条的名字。 */
  readonly selectionToolbar: string
  /** 尺寸徽标里卡片宽高的单位：看板按格计。 */
  readonly sizeUnit: string
  /** 命令「导入数据集」的文字，也是这时导入对话框的标题。 */
  readonly importDataset: string
  /** 命令「导入参数」的文字，也是这时导入对话框的标题。 */
  readonly importParameters: string
  /** 命令「导入模板」的文字，也是导入后那一步撤销的说明；登记了导入器才有这条命令。 */
  readonly importTemplate: string
  /** 菜单栏上报表自己那张菜单「数据」的名字：导入数据集、字段、参数与模板在里面。 */
  readonly menuData: string
  /** 新手引导里报表自己的几步，各一个标题与说明；键见 ReportTourStepKey。 */
  readonly tourSteps: Readonly<Record<ReportTourStepKey, ReportTourStepText>>
  /** 设置对话框「帮助」页的几段操作说明。 */
  readonly helpNotes: readonly string[]
  /** 快捷键表里 Shift 加方向键那一行：把选中的卡片改大或改小一格。 */
  readonly shortcutResize: string
  /** 状态栏左段没选中时：数据集数，主体是看板时再写卡片数（不是看板时 cards 为 undefined）。 */
  readonly statusDocument: (datasets: number, cards: number | undefined) => string
  /** 状态栏左段选中一张卡片时：它左上角所在的列与行（从 1 数起）和占的格数。 */
  readonly statusCell: (column: number, row: number, width: number, height: number) => string
  /** 状态栏右段缩放那一项的标签。 */
  readonly statusZoom: string
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
  /** 字段栏里以选中卡片为源的联动：段名、新增按钮与一条联动的名字（源维度与目标卡片数）。 */
  readonly links: string
  readonly addLink: string
  readonly linkLabel: (dimension: string, targets: number) => string
  /** 字段栏没有编辑对象（看板上没有选中、或选中了多张卡片）时的提示。 */
  readonly wellsEmpty: string
  /** 字段栏的空列表提示。 */
  readonly emptyList: string
  /** 没给取数回调时卡片上的占位说明。 */
  readonly placeholder: string
  /** 问题说明。 */
  readonly issue: (issue: ReportDesignerIssueDetails) => string
  /** 数据面板的新增按钮。 */
  readonly addDataset: string
  readonly addField: string
  readonly addParameter: string
  /** 删除会一并删掉别处时的确认框：标题、说明（各删几处）与确认按钮。 */
  readonly removeTitle: (name: string) => string
  readonly removeCascade: (cascade: ReportDesignerCascade) => string
  readonly removeConfirm: string
  /** 撤销栈里一步的说明：动作加对象名，如「删除卡片「销售额」」「删除 3 个卡片」。 */
  readonly historyStep: (step: ReportHistoryStepText) => string
}

const LIST_LABELS = {
  dimensions: 'Dimensions',
  measures: 'Measures',
  series: 'Series',
  rows: 'Rows',
  columns: 'Columns',
  groups: 'Groups',
  tableColumns: 'Columns',
}

const PALETTE_GROUPS = { charts: 'Charts', metrics: 'Metrics', tables: 'Tables' }

const CARD_TYPES = {
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

const OBJECT_KINDS = {
  document: 'Report',
  dashboard: 'Dashboard',
  dataset: 'Dataset',
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
}

const PROPERTY_GROUPS: Readonly<Record<ReportPropertyGroup, string>> = {
  basic: 'General',
  data: 'Data',
  display: 'Display',
  axis: 'Axes',
  style: 'Style',
  interaction: 'Interaction',
  totals: 'Totals',
  sparkline: 'Sparkline',
}

const PROPERTY_LABELS = {
  'title': 'Title',
  'description': 'Description',
  'grid.columns': 'Columns',
  'grid.rowHeight': 'Row height',
  'dataset': 'Dataset',
  'parameters': 'Parameter bindings',
  'filter': 'Filter',
  'query.filter': 'Filter',
  'query.limit': 'Row limit',
  'limit': 'Row limit',
  'sort': 'Sort',
  'detail': 'Show detail rows',
  'grandTotal': 'Grand total',
  'measuresOn': 'Measures on',
  'rowTotals.subtotals': 'Row subtotals',
  'rowTotals.grandTotal': 'Row grand total',
  'columnTotals.subtotals': 'Column subtotals',
  'columnTotals.grandTotal': 'Column grand total',
  'splitBy': 'Split series by',
  'orientation': 'Orientation',
  'totals': 'Show totals',
  'palette': 'Palette',
  'renderer': 'Renderer',
  'xAxis.title': 'X-axis title',
  'xAxis.scale': 'X-axis scale',
  'xAxis.format': 'X-axis format',
  'xAxis.grid': 'X-axis grid lines',
  'xAxis.zero': 'X-axis includes zero',
  'xAxis.nice': 'Round X-axis range',
  'xAxis.reverse': 'Reverse X-axis',
  'xAxis.ticks': 'X-axis tick count',
  'xAxis.labelOverflow': 'Long X-axis labels',
  'yAxis.title': 'Y-axis title',
  'yAxis.scale': 'Y-axis scale',
  'yAxis.format': 'Y-axis format',
  'yAxis.grid': 'Y-axis grid lines',
  'yAxis.zero': 'Y-axis includes zero',
  'yAxis.nice': 'Round Y-axis range',
  'yAxis.reverse': 'Reverse Y-axis',
  'yAxis.ticks': 'Y-axis tick count',
  'yAxis.labelOverflow': 'Long Y-axis labels',
  'trigger': 'Tooltip trigger',
  'tooltipOrder': 'Tooltip order',
  'zoom': 'Zoom',
  'brush': 'Brush',
  'annotations': 'Annotations',
  'nameField': 'Name dimension',
  'valueField': 'Value measure',
  'variant': 'Variant',
  'rose': 'Rose chart',
  'sweep': 'Sweep',
  'maxSlices': 'Maximum slices',
  'labels': 'Labels',
  'labelContent': 'Label content',
  'format': 'Format',
  'shape': 'Shape',
  'align': 'Alignment',
  'direction': 'Direction',
  'conversion': 'Conversion rate',
  'indicators': 'Indicators',
  'area': 'Area',
  'scale': 'Scale',
  'curve': 'Curve',
  'rings': 'Rings',
  'ringLabels': 'Ring labels',
  'sourceField': 'Source dimension',
  'targetField': 'Target dimension',
  'nodeAlign': 'Node alignment',
  'linkColor': 'Link color',
  'nodeSort': 'Node order',
  'dateField': 'Date dimension',
  'startDate': 'Start date',
  'endDate': 'End date',
  'firstDayOfWeek': 'First day of the week',
  'rowField': 'Row dimension',
  'columnField': 'Column dimension',
  'levels': 'Levels',
  'thresholds': 'Thresholds',
  'midpoint': 'Midpoint',
  'continuous': 'Continuous color scale',
  'tone': 'Tone',
  'size': 'Size',
  'layout': 'Layout',
  'tile': 'Tiling',
  'depth': 'Expanded levels',
  'colorBy': 'Color by',
  'mark': 'Mark',
  'name': 'Name',
  'x': 'X',
  'y': 'Y',
  'color': 'Color measure',
  'stack': 'Stack group',
  'stackOffset': 'Stacking',
  'symbols': 'Data points',
  'connectNulls': 'Connect blanks',
  'endLabel': 'End label',
  'symbol': 'Point shape',
  'jitter': 'Jitter',
  'slot': 'Color slot',
  'value': 'Value',
  'baseline': 'Baseline',
  'prefix': 'Prefix',
  'suffix': 'Suffix',
  'sparkline.x': 'Sparkline X',
  'sparkline.y': 'Sparkline value',
  'sparkline.variant': 'Sparkline variant',
  'sparkline.curve': 'Sparkline curve',
  'sparkline.markers': 'Sparkline markers',
  'sparkline.tone': 'Sparkline tone',
  'field': 'Field',
  'width': 'Column width',
  'sticky': 'Freeze',
  'summary.aggregate': 'Summary',
  'summary.formula': 'Summary formula',
  'bucket': 'Date grouping',
  'sort.by': 'Sort by',
  'sort.direction': 'Sort direction',
  'sort.nulls': 'Blanks',
  'header': 'Group header',
  'subtotal': 'Group subtotal',
  'aggregate': 'Aggregate',
  'formula': 'Formula',
  'type': 'Type',
  'required': 'Required',
  'multiple': 'Multiple values',
  'defaultValue': 'Default value',
  'options': 'Options',
  'card': 'Source card',
  'dimension': 'Source dimension',
  'targets': 'Targets',
  'series:size': 'Bubble size',
  'measure:field': 'Field',
}

const OPTION_LABELS = {
  'none': 'None',
  'auto': 'Auto',
  'start': 'Start',
  'center': 'Center',
  'end': 'End',
  'inside': 'Inside',
  'outside': 'Outside',
  'vertical': 'Vertical',
  'horizontal': 'Horizontal',
  'asc': 'Ascending',
  'desc': 'Descending',
  'ascending': 'Ascending',
  'descending': 'Descending',
  'first': 'First',
  'last': 'Last',
  'sum': 'Sum',
  'avg': 'Average',
  'count': 'Count',
  'min': 'Minimum',
  'max': 'Maximum',
  'distinctCount': 'Distinct count',
  'year': 'Year',
  'quarter': 'Quarter',
  'month': 'Month',
  'week': 'Week',
  'day': 'Day',
  'hour': 'Hour',
  'string': 'Text',
  'number': 'Number',
  'boolean': 'Boolean',
  'date': 'Date',
  'datetime': 'Date and time',
  'bar': 'Bar',
  'line': 'Line',
  'scatter': 'Scatter',
  'pie': 'Pie',
  'donut': 'Donut',
  'full': 'Full circle',
  'half': 'Half circle',
  'name': 'Name',
  'share': 'Share',
  'value': 'Value',
  'name-share': 'Name and share',
  'name-value': 'Name and value',
  'trapezoid': 'Trapezoid',
  'previous': 'Relative to the previous stage',
  'up': 'Up',
  'down': 'Down',
  'polygon': 'Polygon',
  'circle': 'Circle',
  'shared': 'Shared scale',
  'independent': 'Separate scales',
  'calendar': 'Calendar',
  'matrix': 'Matrix',
  'sequential': 'Sequential',
  'diverging': 'Diverging',
  'treemap': 'Treemap',
  'sunburst': 'Sunburst',
  'icicle': 'Icicle',
  'pack': 'Circle packing',
  'columns': 'Columns',
  'rows': 'Rows',
  'axis': 'Whole axis',
  'item': 'Single point',
  'series': 'By series',
  'lollipop': 'Lollipop',
  'expand': 'Percent stacked',
  'linear': 'Straight',
  'monotone': 'Smooth',
  'step': 'Step',
  'always': 'Always',
  'sm': 'Small',
  'md': 'Medium',
  'lg': 'Large',
  'brand': 'Brand',
  'neutral': 'Neutral',
  'success': 'Success',
  'warning': 'Warning',
  'danger': 'Danger',
  'info': 'Info',
  'measuresOn=columns': 'Columns',
  'measuresOn=rows': 'Rows',
  'conversion=first': 'Relative to the first stage',
  'labels=end': 'End',
}

/** 字段栏各列表名的键。 */
export type ReportListLabelKey = keyof typeof LIST_LABELS
/** 物料分组的键。 */
export type ReportPaletteGroupKey = keyof typeof PALETTE_GROUPS
/** 卡片种类的键。 */
export type ReportCardTypeKey = keyof typeof CARD_TYPES
/** 对象种类的键。 */
export type ReportObjectKindKey = keyof typeof OBJECT_KINDS
/** 内建属性名对照表的键。 */
export type ReportPropertyLabelKey = keyof typeof PROPERTY_LABELS
/** 内建下拉选项对照表的键。 */
export type ReportOptionLabelKey = keyof typeof OPTION_LABELS

/** 内建的问题码：designer-kit 的通用码、报表校验的码与参数取值的码。 */
export type ReportBuiltinIssueCode = CommonIssueCode | (typeof REPORT_ISSUE_CODES)[number] | (typeof PARAMETER_ISSUE_CODES)[number]

/** 一个问题码的说明，入参是问题的参数。 */
export type ReportIssueText = (params: Readonly<Record<string, unknown>>) => string

/**
 * 设计器一种语言的全部文案。对照表的键与英文表同一组；issueTexts 按内建问题码各写一条说明，
 * unknownIssue 是认不出的码（扩展的问题码）的说明。
 */
export interface ReportDesignerLocale extends Omit<ReportDesignerTranslations, 'lists' | 'paletteGroups' | 'cardTypes' | 'objectKinds' | 'propertyGroups' | 'propertyLabels' | 'optionLabels' | 'issue'> {
  readonly lists: Readonly<Record<ReportListLabelKey, string>>
  readonly paletteGroups: Readonly<Record<ReportPaletteGroupKey, string>>
  readonly cardTypes: Readonly<Record<ReportCardTypeKey, string>>
  readonly objectKinds: Readonly<Record<ReportObjectKindKey, string>>
  readonly propertyGroups: Readonly<Record<ReportPropertyGroup, string>>
  readonly propertyLabels: Readonly<Record<ReportPropertyLabelKey, string>>
  readonly optionLabels: Readonly<Record<ReportOptionLabelKey, string>>
  readonly issueTexts: Readonly<Record<ReportBuiltinIssueCode, ReportIssueText>>
  readonly unknownIssue: (code: string) => string
}

/** 一种语言的设计器文案换成设计器读的形状：问题说明按码查表，查不到用 unknownIssue。 */
export function reportDesignerTranslations(locale: ReportDesignerLocale): ReportDesignerTranslations {
  const { issueTexts, unknownIssue, ...rest } = locale
  const table = issueTexts as Readonly<Record<string, ReportIssueText | undefined>>
  return {
    ...rest,
    issue: issue => table[issue.code]?.(issue.params ?? {}) ?? unknownIssue(issue.code),
  }
}

function cascadeText(cascade: ReportDesignerCascade): string {
  const parts = [
    [cascade.items, 'list item', 'list items'],
    [cascade.conditions, 'filter condition', 'filter conditions'],
    [cascade.sorts, 'sort rule', 'sort rules'],
    [cascade.links, 'link target', 'link targets'],
    [cascade.bindings, 'parameter binding', 'parameter bindings'],
  ] as const
  const listed = parts.filter(([count]) => count > 0).map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
  return `This also deletes ${listed.join(', ')}. You can undo it.`
}

const TYPE_NAMES: Readonly<Record<string, string>> = {
  string: 'text',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  datetime: 'date-time',
  object: 'object',
  array: 'array',
}

const OPERATOR_NAMES: Readonly<Record<string, string>> = {
  eq: 'equals',
  neq: 'does not equal',
  gt: 'greater than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  between: 'between',
  in: 'is one of',
  notIn: 'is not one of',
  contains: 'contains',
  notContains: 'does not contain',
  startsWith: 'starts with',
  endsWith: 'ends with',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
}

const AGGREGATE_NAMES: Readonly<Record<string, string>> = { sum: 'Sum', avg: 'Average' }

/** 问题参数里的名字写成 "名字"，前面带一个空格；没有时为空串。 */
function quoted(value: unknown): string {
  return value === undefined || value === null ? '' : ` "${String(value)}"`
}

/** 类型名：可以是 a|b 写法的几种之一。 */
function typeName(value: unknown): string {
  return String(value).split('|').map(item => TYPE_NAMES[item] ?? item).join(' or ')
}

function operatorName(value: unknown): string {
  return OPERATOR_NAMES[String(value)] ?? String(value)
}

/** 取值范围：min、max 与 exclusiveMin。 */
function range(params: Readonly<Record<string, unknown>>): string {
  const parts = [
    params.min === undefined ? undefined : `at least ${String(params.min)}`,
    params.exclusiveMin === undefined ? undefined : `greater than ${String(params.exclusiveMin)}`,
    params.max === undefined ? undefined : `at most ${String(params.max)}`,
  ].filter(part => part !== undefined)
  return parts.length === 0 ? '' : `; it must be ${parts.join(' and ')}`
}

const ISSUE_TEXTS: ReportDesignerLocale['issueTexts'] = {
  'required': () => 'This value is required',
  'invalid-type': p => p.expected === undefined ? 'Wrong type' : `Wrong type; expected ${typeName(p.expected)}`,
  'invalid-value': (p) => {
    if (p.min !== undefined && p.max !== undefined)
      return p.min === p.max ? `Invalid value; it needs ${String(p.min)} items` : `Invalid value; it needs ${String(p.min)} to ${String(p.max)} items`
    return p.expected === undefined ? 'Invalid value' : `Invalid value; expected ${String(p.expected)}`
  },
  'out-of-range': p => `Out of range${range(p)}`,
  'not-integer': () => 'This must be a whole number',
  'invalid-option': () => 'This is not one of the allowed values',
  'invalid-color': () => 'This is not a valid color',
  'empty': () => 'This value cannot be empty',
  'unknown-key': p => p.key === undefined ? 'Unknown key' : `Unknown name${quoted(p.key)}`,
  'unknown-control': () => 'Unknown editor kind',
  'duplicate-key': p => `Duplicate name${quoted(p.key)}`,
  'duplicate-id': p => `Duplicate id${quoted(p.id)}`,
  'duplicate-value': () => 'Duplicate option value',
  'aggregate-type-mismatch': p => `${AGGREGATE_NAMES[String(p.aggregate)] ?? String(p.aggregate)} works only on number fields; this field is ${typeName(p.type)}`,
  'bucket-type-mismatch': p => `Date grouping works only on date fields; this field is ${typeName(p.type)}`,
  'chart-reference-role': p => `"${String(p.key)}" must be a ${p.expected === 'dimension' ? 'dimension' : 'measure'}`,
  'format-invalid': () => 'The format is invalid',
  'formula-cycle': p => `Formulas reference each other in a cycle: ${String(p.names ?? '').split(',').join(' → ')}`,
  'formula-invalid': () => 'The formula cannot be parsed',
  'formula-unknown-reference': p => `The formula refers to an unknown name${quoted(p.name)}`,
  'layout-out-of-bounds': p => `The card is outside the ${String(p.columns)}-column grid`,
  'layout-overlap': p => `The card overlaps card${quoted(p.card)}`,
  'link-target-type-mismatch': p => `The source dimension is grouped by date, so the target field must be a date; this field is ${typeName(p.type)}`,
  'measure-definition': () => 'A measure needs either an aggregate or a formula, not both',
  'operand-required': () => 'A value to compare with is missing',
  'operand-shape': (p) => {
    if (p.operator === 'between')
      return '"between" needs two values'
    if (p.operator === 'in' || p.operator === 'notIn')
      return `"${operatorName(p.operator)}" needs a list of values`
    return p.operator === undefined ? 'Only one value is allowed here' : `"${operatorName(p.operator)}" needs a single value`
  },
  'operand-type-mismatch': p => `The value must be ${typeName(p.expected)}`,
  'operator-type-mismatch': p => `"${operatorName(p.operator)}" does not apply to ${typeName(p.type)} fields`,
  'reserved-name': p => `"${String(p.key)}" starts with $, which is reserved for report parameters in formulas`,
  'unknown-card': p => `Unknown card${quoted(p.card)}`,
  'unknown-dataset': p => `Unknown dataset${quoted(p.dataset)}`,
  'unknown-dataset-parameter': p => `The dataset has no parameter${quoted(p.parameter)}`,
  'unknown-dimension': p => `Unknown dimension${quoted(p.key)}`,
  'unknown-field': p => `Unknown field${quoted(p.field)}`,
  'unknown-kind': p => `The kind${quoted(p.kind)} is not registered; install the extension that registers it`,
  'unknown-measure': p => `Unknown measure${quoted(p.key)}`,
  'unknown-parameter': p => `Unknown parameter${quoted(p.parameter)}`,
  'unknown-series': p => `Unknown series${quoted(p.series)}`,
  'unsupported-schema-version': p => `Report version ${String(p.version)} is not supported`,
  'parameter-required': () => 'This parameter needs a value',
  'parameter-type-mismatch': () => 'The parameter value has the wrong type',
  'parameter-not-multiple': () => 'This parameter takes a single value',
  'parameter-option-mismatch': () => 'The value is not one of the options',
}

function historyStepText(step: ReportHistoryStepText): string {
  const kind = step.kind.toLocaleLowerCase('en')
  const target = step.count > 1 ? `${step.count} ${kind} items` : step.name === undefined ? kind : `${kind} "${step.name}"`
  switch (step.action) {
    case 'add':
      return `Add ${target}`
    case 'remove':
      return step.cascade ? `Delete ${target} and ${step.cascade} ${step.cascade === 1 ? 'reference' : 'references'}` : `Delete ${target}`
    case 'move':
      return `Move ${target}`
    case 'rename':
      return `Rename ${kind} "${step.name}" to "${step.to}"`
    case 'layout':
      return `Rearrange ${target}`
    case 'replace':
      return `Replace ${target}`
    case 'update':
      return step.property === undefined ? `Edit ${target}` : `Edit ${step.property.toLocaleLowerCase('en')} of ${target}`
  }
}

/** 设计器的英文文案，各语言包按它对键。 */
export const REPORT_DESIGNER_EN_US: ReportDesignerLocale = {
  label: 'Report designer',
  canvas: 'Canvas',
  datasets: 'Datasets',
  parameters: 'Parameters',
  wells: 'Fields',
  lists: LIST_LABELS,
  palette: 'Elements',
  properties: 'Properties',
  issues: 'Problems',
  datasetsHelp: 'The datasets and fields this report uses. Drag a field onto a card or a field list; select one to edit its title, type and formula in Properties.',
  parametersHelp: 'Report parameters are filled in above the report and referenced by name in filters and formulas.',
  paletteHelp: 'Charts, metrics and tables. Drag one onto the dashboard, or click it to place it in the first free spot.',
  wellsHelp: 'Dimensions, measures, series and columns of the selected card. Drag fields in, drag to reorder, and use the cross to remove.',
  propertiesHelp: 'Properties of the selected object. With several cards selected, only the properties they share are listed.',
  issuesHelp: 'Validation problems in the report. Select one to select the object it is about.',
  selectionToolbar: 'Selected cards',
  sizeUnit: 'cells',
  importDataset: 'Import dataset',
  importParameters: 'Import parameters',
  importTemplate: 'Import template',
  menuData: 'Data',
  tourSteps: {
    datasets: { title: 'Data', description: 'Datasets with their fields, and the report parameters. Drag a field onto a card to show it there.' },
    wells: { title: 'Fields', description: 'What the selected card shows: dimensions, measures, series or columns. Drag fields in, drag to reorder, and remove them with ×.' },
    cards: { title: 'Cards', description: 'Drag a card to move it and drag its edges to resize it; it snaps to the grid. When a card is selected, the bar above copies or deletes it and the badge below shows its size in cells.' },
    links: { title: 'Links', description: 'Below the fields of a selected card, link it to other cards: clicking a value in this card then filters the cards it links to.' },
    preview: { title: 'Preview', description: 'Run the report with data and parameters, the way its users will see it.' },
  },
  helpNotes: [
    'Drag fields from the Data panel onto a card or into its fields to choose what the card shows. Number fields become measures; the others become dimensions.',
    'On a dashboard, drag cards to move them and drag their edges to resize them; they snap to the grid. The size badge below a selected card changes its width and height in cells.',
    'Switch to Preview to run the report with data and parameters. Press Ctrl+S (⌘S on macOS) to save; where the report is stored is up to the system you use it in.',
  ],
  shortcutResize: 'Resize the selected card by one cell',
  statusDocument: (datasets, cards) => `${datasets} ${datasets === 1 ? 'dataset' : 'datasets'}${cards === undefined ? '' : ` · ${cards} ${cards === 1 ? 'card' : 'cards'}`}`,
  statusCell: (column, row, width, height) => `Column ${column}, row ${row} · ${width} × ${height}`,
  statusZoom: 'Zoom',
  paletteGroups: PALETTE_GROUPS,
  cardTypes: CARD_TYPES,
  objectKinds: OBJECT_KINDS,
  propertyGroups: PROPERTY_GROUPS,
  propertyLabels: PROPERTY_LABELS,
  optionLabels: OPTION_LABELS,
  selected: count => `${count} selected`,
  emptyDashboard: 'Drag a chart, metric or table here',
  links: 'Links',
  addLink: 'Add link',
  linkLabel: (dimension, targets) => `${dimension} → ${targets} ${targets === 1 ? 'card' : 'cards'}`,
  wellsEmpty: 'Select a card to edit its fields',
  emptyList: 'Drop fields here',
  placeholder: 'Sample data appears when a data provider is set',
  addDataset: 'Add dataset',
  addField: 'Add field',
  addParameter: 'Add parameter',
  removeTitle: name => `Delete "${name}"`,
  removeCascade: cascadeText,
  removeConfirm: 'Delete',
  historyStep: historyStepText,
  issueTexts: ISSUE_TEXTS,
  unknownIssue: code => `Problem: ${code}`,
}

/** 内建英文文案。 */
export const DEFAULT_REPORT_DESIGNER_TRANSLATIONS: ReportDesignerTranslations = reportDesignerTranslations(REPORT_DESIGNER_EN_US)

declare module '@xihan-ui/web-components' {
  interface XhTranslationOverrides {
    'xh-report-designer'?: Partial<ReportDesignerTranslations>
  }
}
