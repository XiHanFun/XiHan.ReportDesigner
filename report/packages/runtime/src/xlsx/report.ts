/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 把报表视图与计算结果排成工作表：明细表、分组报表与交叉表。

import type {
  ColumnSummary,
  CrosstabAxisNode,
  CrosstabLabel,
  CrosstabResult,
  CrosstabView,
  DatasetSchema,
  DateTools,
  FieldType,
  FormatSpec,
  GroupNode,
  GroupReportResult,
  GroupView,
  Measure,
  TableColumn,
  TableResult,
  TableView,
} from '@xihan-report/core'
import type { XlsxCell, XlsxHeaderNode, XlsxMerge, XlsxRow, XlsxSheet } from '@xihan-ui/xlsx'
import { createDateTools, crosstabAxes, isAggregateMeasure } from '@xihan-report/core'
import { formatValue } from '@xihan-ui/expression'
import { isMissing } from '@xihan-ui/viz'
import { formatCode, headerRows, sheetName } from '@xihan-ui/xlsx'
import { fieldLabel, measureLabel } from '../labels'

/** 工作表里的内建文字。 */
export interface XlsxTranslations {
  /** 总计行、总计列的标签。 */
  readonly total: string
  /** 小计行、小计列的标签。 */
  readonly subtotal: string
}

/** 生成工作表的选项。 */
export interface SheetOptions {
  /** 视图用的数据集：取字段标题与类型。 */
  readonly dataset: DatasetSchema
  /** 表名，整理成合法表名；缺省 Sheet1。 */
  readonly name?: string
  /** 时刻类的日期值（带偏移的字符串、时间戳、Date）换成墙上时间所在的时区，缺省 UTC，与计算时一致。 */
  readonly timeZone?: string
  readonly translations?: Partial<XlsxTranslations>
}

const DEFAULT_TRANSLATIONS: XlsxTranslations = { total: 'Total', subtotal: 'Subtotal' }
const COUNT_FORMAT = '#,##0'
const HEADER_WIDTH = 16
const PX_PER_CHAR = 7

type Cells = (XlsxCell | null | undefined)[]

interface Context {
  readonly dataset: DatasetSchema
  readonly dates: DateTools
  readonly timeZone: string
  readonly t: XlsxTranslations
}

function context(options: SheetOptions): Context {
  return {
    dataset: options.dataset,
    dates: createDateTools(options.timeZone),
    timeZone: options.timeZone ?? 'UTC',
    t: { ...DEFAULT_TRANSLATIONS, ...options.translations },
  }
}

function fieldOf(ctx: Context, name: string): { readonly type: FieldType, readonly title?: string } | undefined {
  return ctx.dataset.fields.find(field => field.name === name)
}

function fieldTitle(ctx: Context, name: string, title: string | undefined): string {
  return fieldLabel(ctx.dataset, name, title)
}

function text(value: string, bold: boolean): XlsxCell {
  return bold ? { type: 'text', value, bold } : { type: 'text', value }
}

/** formatValue 的文本；格式说明或值不合法时为 null。 */
function formatted(value: unknown, format: FormatSpec, ctx: Context): string | null {
  try {
    return formatValue(value, format, { timeZone: ctx.timeZone })
  }
  catch {
    return null
  }
}

function dateCell(value: unknown, type: FieldType | undefined, format: FormatSpec | undefined, ctx: Context, bold: boolean): XlsxCell | null {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date))
    return null
  let parts: ReturnType<DateTools['parts']>
  try {
    parts = ctx.dates.parts(value)
  }
  catch {
    return null
  }
  if (!parts || parts.year < 1900 || parts.year > 9999)
    return null
  const code = format?.kind === 'date' ? formatCode(format) : undefined
  if (code === null) {
    const shown = formatted(value, format!, ctx)
    return shown === null ? null : text(shown, bold)
  }
  const kind = type === 'date' || type === 'datetime' ? type : parts.hour === null ? 'date' : 'datetime'
  const time = kind === 'datetime'
    ? { hour: parts.hour ?? 0, minute: parts.minute ?? 0, second: parts.second ?? 0, millisecond: parts.millisecond ?? 0 }
    : {}
  return {
    type: 'date',
    value: { year: parts.year, month: parts.month ?? 1, day: parts.day ?? 1, ...time },
    ...(code === undefined ? {} : { format: code }),
    ...(bold ? { bold } : {}),
  }
}

/**
 * 数字配格式说明：Excel 表达不了（formatCode 为 null）时写成 formatValue 的文本；
 * rounding 不是 half-up 时先按 formatValue 的十进制运算舍入好再写成数字，因为 Excel 显示时一律四舍五入。
 */
function numberCell(value: number, format: FormatSpec, ctx: Context, bold: boolean): XlsxCell {
  const code = formatCode(format)
  if (code === null)
    return text(formatted(value, format, ctx) ?? String(value), bold)
  let shown = value
  if ((format.kind === 'number' || format.kind === 'percent') && format.rounding !== undefined && format.rounding !== 'half-up'
    && (format.decimals !== undefined || format.maxDecimals !== undefined)) {
    const rounded = formatted(value, { ...format, grouping: false }, ctx)
    if (rounded !== null)
      shown = format.kind === 'percent' ? Number(rounded.replace('%', '')) / 100 : Number(rounded)
  }
  return bold ? { type: 'number', value: shown, format: code, bold } : { type: 'number', value: shown, format: code }
}

/**
 * 一个值写成单元格：缺失值为空；date / datetime 字段与日期格式的值写成日期单元格（格式代码由 formatCode 换出，
 * 表达不了时写成 formatValue 的文本），解析不了或不在 1900–9999 年的按原文写成文本；有限数配格式说明见 numberCell，
 * Infinity 写成文本；布尔值写成布尔单元格，其余写成文本。
 */
function valueCell(value: unknown, type: FieldType | undefined, format: FormatSpec | undefined, ctx: Context, bold = false): XlsxCell | null {
  if (isMissing(value))
    return null
  const numeric = format?.kind === 'number' || format?.kind === 'percent' || format?.kind === 'rmb-upper' || format?.kind === 'numeral'
  const dateLike = value instanceof Date || format?.kind === 'date' || ((type === 'date' || type === 'datetime') && !numeric)
  if (dateLike) {
    const cell = dateCell(value, type, format, ctx, bold)
    if (cell)
      return cell
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      return text(String(value), bold)
    if (numeric)
      return numberCell(value, format!, ctx, bold)
    return bold ? { type: 'number', value, bold } : { type: 'number', value }
  }
  if (typeof value === 'boolean')
    return bold ? { type: 'boolean', value, bold } : { type: 'boolean', value }
  if (typeof value === 'string')
    return text(value, bold)
  if (value instanceof Date)
    return text(value.toISOString(), bold)
  let serialized: string
  try {
    serialized = JSON.stringify(value) ?? String(value)
  }
  catch {
    serialized = String(value)
  }
  return text(serialized, bold)
}

function label(value: string): XlsxCell {
  return { type: 'text', value, bold: true }
}

function countCell(value: unknown, bold: boolean): XlsxCell | null {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return null
  return bold ? { type: 'number', value, format: COUNT_FORMAT, bold } : { type: 'number', value, format: COUNT_FORMAT }
}

function summaryCell(column: TableColumn, summary: ColumnSummary, value: unknown, ctx: Context, bold: boolean): XlsxCell | null {
  if ('aggregate' in summary) {
    if (summary.aggregate === 'count' || summary.aggregate === 'distinctCount')
      return countCell(value, bold)
    if (summary.aggregate === 'min' || summary.aggregate === 'max')
      return valueCell(value, fieldOf(ctx, column.field)?.type, column.format, ctx, bold)
  }
  return valueCell(value, undefined, column.format, ctx, bold)
}

function measureCell(measure: Measure, value: unknown, ctx: Context, bold: boolean): XlsxCell | null {
  if (isAggregateMeasure(measure)) {
    if (measure.aggregate === 'count' || measure.aggregate === 'distinctCount')
      return countCell(value, bold)
    if ((measure.aggregate === 'min' || measure.aggregate === 'max') && measure.field !== undefined)
      return valueCell(value, fieldOf(ctx, measure.field)?.type, measure.format, ctx, bold)
  }
  return valueCell(value, undefined, measure.format, ctx, bold)
}

function measureTitle(measure: Measure, ctx: Context): string {
  return measureLabel(measure, ctx.dataset)
}

function columnWidth(column: TableColumn): number | undefined {
  return column.width === undefined ? undefined : Math.max(1, Math.round(column.width / PX_PER_CHAR))
}

/**
 * 明细表排成工作表：首行是列标题，之后每行一条明细，有汇总时末行写合计（首列没有汇总时写合计标签）；冻结首行。
 */
export function tableSheet(view: TableView, result: TableResult, options: SheetOptions): XlsxSheet {
  const ctx = context(options)
  const { columns } = view
  const rows: XlsxRow[] = [columns.map(column => label(fieldTitle(ctx, column.field, column.title)))]
  for (const row of result.rows)
    rows.push(columns.map(column => valueCell(row[column.field], fieldOf(ctx, column.field)?.type, column.format, ctx)))
  if (result.summary) {
    const summary = result.summary
    const cells: Cells = columns.map(column => (column.summary ? summaryCell(column, column.summary, summary[column.id], ctx, true) : null))
    if (columns.length > 0 && !columns[0]!.summary)
      cells[0] = label(ctx.t.total)
    rows.push(cells)
  }
  return {
    name: sheetName(options.name ?? ''),
    rows,
    columnWidths: columns.map(columnWidth),
    frozen: { rows: 1, columns: 0 },
  }
}

/**
 * 分组报表排成工作表：前几列是各级分组，之后是视图的列。
 * 每组先写组头（分组列写组的键），再写下一级或明细，组尾写小计（分组列写小计标签，组头关掉时写组的键）；
 * 不列明细时最后一级每组一行，键与小计写在同一行。末尾写总计，冻结首行。
 */
export function groupSheet(view: GroupView, result: GroupReportResult, options: SheetOptions): XlsxSheet {
  const ctx = context(options)
  const { groups, columns } = view
  const offset = groups.length
  const detail = view.detail !== false
  const rows: XlsxRow[] = [[
    ...groups.map(group => label(fieldTitle(ctx, group.field, group.title))),
    ...columns.map(column => label(fieldTitle(ctx, column.field, column.title))),
  ]]

  function summaries(cells: Cells, node: { readonly summary: Readonly<Record<string, unknown>> }, bold: boolean): void {
    columns.forEach((column, i) => {
      if (column.summary)
        cells[offset + i] = summaryCell(column, column.summary, node.summary[column.id], ctx, bold)
    })
  }

  function walk(nodes: readonly GroupNode[]): void {
    for (const node of nodes) {
      const group = groups[node.level]!
      const type = group.bucket ? undefined : fieldOf(ctx, group.field)?.type
      const leaf = node.level === groups.length - 1
      if (leaf && !detail) {
        const cells: Cells = []
        cells[node.level] = valueCell(node.key, type, group.format, ctx)
        summaries(cells, node, false)
        rows.push(cells)
        continue
      }
      if (group.header !== false) {
        const cells: Cells = []
        cells[node.level] = valueCell(node.key, type, group.format, ctx, true)
        rows.push(cells)
      }
      if (leaf) {
        for (const row of node.rows) {
          const cells: Cells = []
          columns.forEach((column, i) => {
            cells[offset + i] = valueCell(row[column.field], fieldOf(ctx, column.field)?.type, column.format, ctx)
          })
          rows.push(cells)
        }
      }
      else {
        walk(node.children)
      }
      if (group.subtotal !== false) {
        const cells: Cells = []
        cells[node.level] = group.header === false ? valueCell(node.key, type, group.format, ctx, true) ?? label(ctx.t.subtotal) : label(ctx.t.subtotal)
        summaries(cells, node, true)
        rows.push(cells)
      }
    }
  }
  walk(result.groups)

  if (result.total) {
    const cells: Cells = [label(ctx.t.total)]
    summaries(cells, { summary: result.total }, true)
    rows.push(cells)
  }
  return {
    name: sheetName(options.name ?? ''),
    rows,
    columnWidths: [...groups.map(() => HEADER_WIDTH), ...columns.map(columnWidth)],
    frozen: { rows: 1, columns: 0 },
  }
}

function headerCell(item: CrosstabLabel, ctx: Context): XlsxCell | null {
  switch (item.kind) {
    case 'member':
      return valueCell(item.value, item.dimension.bucket ? undefined : fieldOf(ctx, item.dimension.field)?.type, item.dimension.format, ctx, true)
    case 'total':
      return label(ctx.t.total)
    case 'subtotal':
      return label(ctx.t.subtotal)
    case 'measure':
      return label(measureTitle(item.measure, ctx))
  }
}

/** 表头树换成 headerRows 的节点：有下级的节点带上它纵向占的层数。 */
function headerNodes(nodes: readonly CrosstabAxisNode[], ctx: Context): XlsxHeaderNode[] {
  return nodes.map(node => node.children.length > 0
    ? { cell: headerCell(node.label, ctx), children: headerNodes(node.children, ctx), span: node.span }
    : { cell: headerCell(node.label, ctx) })
}

/**
 * 交叉表排成工作表：左上角是表头区，上方是列轴的多层表头，左侧是行轴的多层表头，相同的上层成员合并单元格，
 * 小计与总计的标签向内合并；多个度量按 measuresOn 排在最内一层，没有列维度时列轴只有度量一层。
 * 行维度标题写在表头区最下一行，列维度标题写在表头区最右一列（与行维度标题同格时让给行维度标题）；冻结表头区。
 */
export function crosstabSheet(view: CrosstabView, result: CrosstabResult, options: SheetOptions): XlsxSheet {
  const ctx = context(options)
  const measures = view.measures
  const axes = crosstabAxes(view, result)
  const top = Math.max(axes.columns.levels, 1)
  const left = axes.rows.levels

  const rows: Cells[] = []
  const merges: XlsxMerge[] = []
  const set = (row: number, column: number, cell: XlsxCell | null): void => {
    (rows[row] ??= [])[column] = cell
  }

  const columnHeader = headerRows(headerNodes(axes.columns.tree, ctx))
  columnHeader.rows.forEach((cells, row) => cells.forEach((cell, column) => cell && set(row, left + column, cell)))
  merges.push(...columnHeader.merges.map(merge => ({ ...merge, column: left + merge.column })))
  const rowHeader = headerRows(headerNodes(axes.rows.tree, ctx), { axis: 'row' })
  rowHeader.rows.forEach((cells, row) => cells.forEach((cell, column) => cell && set(top + row, column, cell)))
  merges.push(...rowHeader.merges.map(merge => ({ ...merge, row: top + merge.row })))

  view.rows.forEach((dimension, index) => {
    set(top - 1, index, label(fieldTitle(ctx, dimension.field, dimension.title)))
  })
  if (left > 0) {
    view.columns.forEach((dimension, index) => {
      if (index !== top - 1 || left - 1 >= view.rows.length)
        set(index, left - 1, label(fieldTitle(ctx, dimension.field, dimension.title)))
    })
  }

  axes.rows.leaves.forEach((rowLeaf, r) => {
    axes.columns.leaves.forEach((columnLeaf, c) => {
      const index = columnLeaf.measure ?? rowLeaf.measure ?? 0
      const measure = measures[index]
      if (!measure)
        return
      const value = result.cells[rowLeaf.header]?.[columnLeaf.header]?.[index]
      set(top + r, left + c, measureCell(measure, value, ctx, rowLeaf.emphasis || columnLeaf.emphasis))
    })
  })

  return {
    name: sheetName(options.name ?? ''),
    rows: Array.from({ length: rows.length }, (_, i) => rows[i] ?? []),
    merges,
    columnWidths: Array.from<number>({ length: left }).fill(HEADER_WIDTH),
    frozen: { rows: top, columns: left },
  }
}
