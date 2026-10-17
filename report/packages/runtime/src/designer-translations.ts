/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表设计器的内建文案；类型补进 UI 的 XhTranslationOverrides。几张对照表（属性名、选项、卡片种类等）按键整份覆盖。

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
  readonly selectAll: string
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
  /** 物料面板的标题，也是外框里这个区的名字。 */
  readonly palette: string
  /** 属性面板的标题，也是外框里这个区的名字。 */
  readonly properties: string
  /** 问题列表的标题，也是外框里这个区的名字。 */
  readonly issues: string
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

function issueText(issue: ReportDesignerIssueDetails): string {
  const params = issue.params ?? {}
  switch (issue.code) {
    case 'required':
      return 'This value is required'
    case 'invalid-type':
      return params.expected === undefined ? 'Wrong type' : `Wrong type; expected ${typeName(params.expected)}`
    case 'invalid-value':
      if (params.min !== undefined && params.max !== undefined)
        return params.min === params.max ? `Invalid value; it needs ${String(params.min)} items` : `Invalid value; it needs ${String(params.min)} to ${String(params.max)} items`
      return params.expected === undefined ? 'Invalid value' : `Invalid value; expected ${String(params.expected)}`
    case 'out-of-range':
      return `Out of range${range(params)}`
    case 'not-integer':
      return 'This must be a whole number'
    case 'invalid-option':
      return 'This is not one of the allowed values'
    case 'invalid-color':
      return 'This is not a valid color'
    case 'empty':
      return 'This value cannot be empty'
    case 'unknown-key':
      return params.key === undefined ? 'Unknown key' : `Unknown name${quoted(params.key)}`
    case 'unknown-control':
      return 'Unknown editor kind'
    case 'duplicate-key':
      return `Duplicate name${quoted(params.key)}`
    case 'duplicate-id':
      return `Duplicate id${quoted(params.id)}`
    case 'aggregate-type-mismatch':
      return `${AGGREGATE_NAMES[String(params.aggregate)] ?? String(params.aggregate)} works only on number fields; this field is ${typeName(params.type)}`
    case 'bucket-type-mismatch':
      return `Date grouping works only on date fields; this field is ${typeName(params.type)}`
    case 'chart-reference-role':
      return `"${String(params.key)}" must be a ${params.expected === 'dimension' ? 'dimension' : 'measure'}`
    case 'format-invalid':
      return 'The format is invalid'
    case 'formula-cycle':
      return `Formulas reference each other in a cycle: ${String(params.names ?? '').split(',').join(' → ')}`
    case 'formula-invalid':
      return 'The formula cannot be parsed'
    case 'formula-unknown-reference':
      return `The formula refers to an unknown name${quoted(params.name)}`
    case 'layout-out-of-bounds':
      return `The card is outside the ${String(params.columns)}-column grid`
    case 'layout-overlap':
      return `The card overlaps card${quoted(params.card)}`
    case 'link-target-type-mismatch':
      return `The source dimension is grouped by date, so the target field must be a date; this field is ${typeName(params.type)}`
    case 'measure-definition':
      return 'A measure needs either an aggregate or a formula, not both'
    case 'operand-required':
      return 'A value to compare with is missing'
    case 'operand-shape':
      if (params.operator === 'between')
        return '"between" needs two values'
      if (params.operator === 'in' || params.operator === 'notIn')
        return `"${operatorName(params.operator)}" needs a list of values`
      return params.operator === undefined ? 'Only one value is allowed here' : `"${operatorName(params.operator)}" needs a single value`
    case 'operand-type-mismatch':
      return `The value must be ${typeName(params.expected)}`
    case 'operator-type-mismatch':
      return `"${operatorName(params.operator)}" does not apply to ${typeName(params.type)} fields`
    case 'reserved-name':
      return `"${String(params.key)}" starts with $, which is reserved for report parameters in formulas`
    case 'unknown-card':
      return `Unknown card${quoted(params.card)}`
    case 'unknown-dataset':
      return `Unknown dataset${quoted(params.dataset)}`
    case 'unknown-dataset-parameter':
      return `The dataset has no parameter${quoted(params.parameter)}`
    case 'unknown-dimension':
      return `Unknown dimension${quoted(params.key)}`
    case 'unknown-field':
      return `Unknown field${quoted(params.field)}`
    case 'unknown-kind':
      return `The kind${quoted(params.kind)} is not registered; install the extension that registers it`
    case 'unknown-measure':
      return `Unknown measure${quoted(params.key)}`
    case 'unknown-parameter':
      return `Unknown parameter${quoted(params.parameter)}`
    case 'unknown-series':
      return `Unknown series${quoted(params.series)}`
    case 'unsupported-schema-version':
      return `Report version ${String(params.version)} is not supported`
    case 'parameter-required':
      return 'This parameter needs a value'
    case 'parameter-type-mismatch':
      return 'The parameter value has the wrong type'
    case 'parameter-not-multiple':
      return 'This parameter takes a single value'
    case 'parameter-option-mismatch':
      return 'The value is not one of the options'
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
  selectAll: 'Select all',
  design: 'Design',
  preview: 'Preview',
  data: 'Data',
  datasets: 'Datasets',
  parameters: 'Parameters',
  wells: 'Fields',
  lists: { dimensions: 'Dimensions', measures: 'Measures', series: 'Series', rows: 'Rows', columns: 'Columns', groups: 'Groups', tableColumns: 'Columns' },
  palette: 'Elements',
  properties: 'Properties',
  issues: 'Problems',
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
  links: 'Links',
  addLink: 'Add link',
  linkLabel: (dimension, targets) => `${dimension} → ${targets} ${targets === 1 ? 'card' : 'cards'}`,
  wellsEmpty: 'Select a card to edit its fields',
  emptyList: 'Drop fields here',
  placeholder: 'Sample data appears when a data provider is set',
  issue: issueText,
  addDataset: 'Add dataset',
  addField: 'Add field',
  addParameter: 'Add parameter',
  removeTitle: name => `Delete "${name}"`,
  removeCascade: cascadeText,
  removeConfirm: 'Delete',
}

declare module '@xihan-ui/web-components' {
  interface XhTranslationOverrides {
    'xh-report-designer'?: Partial<ReportDesignerTranslations>
  }
}
