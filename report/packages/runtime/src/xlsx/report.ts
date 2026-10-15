/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 把报表视图与计算结果排成工作表：明细表、分组报表与交叉表。

import type {
  ColumnSummary,
  CrosstabHeader,
  CrosstabResult,
  CrosstabView,
  DatasetSchema,
  DateTools,
  Dimension,
  FieldType,
  GroupNode,
  GroupReportResult,
  GroupView,
  Measure,
  TableColumn,
  TableResult,
  TableView,
  ValueFormat,
} from '@xihan-report/core'
import type { XlsxCell, XlsxMerge, XlsxRow, XlsxSheet } from './workbook'
import { createDateTools, isAggregateMeasure, isMissing, valueKey } from '@xihan-report/core'
import { dateFormatCode, excelSerial, numberFormatCode } from './format'
import { sheetName } from './workbook'

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
  /** 日期值换成 Excel 日期时所在的时区，缺省 UTC，与计算时一致。 */
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
  readonly t: XlsxTranslations
}

function context(options: SheetOptions): Context {
  return {
    dataset: options.dataset,
    dates: createDateTools(options.timeZone),
    t: { ...DEFAULT_TRANSLATIONS, ...options.translations },
  }
}

function fieldOf(ctx: Context, name: string): { readonly type: FieldType, readonly title?: string } | undefined {
  return ctx.dataset.fields.find(field => field.name === name)
}

function fieldTitle(ctx: Context, name: string, title: string | undefined): string {
  return title ?? fieldOf(ctx, name)?.title ?? name
}

function dateCell(value: unknown, type: FieldType | undefined, format: ValueFormat | undefined, ctx: Context): XlsxCell | null {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date))
    return null
  try {
    const parts = ctx.dates.parts(value)
    const serial = parts && excelSerial(parts)
    if (!parts || serial === null || serial === undefined)
      return null
    const kind = type === 'date' || type === 'datetime' ? type : parts.hour === null ? 'date' : 'datetime'
    return { value: serial, format: dateFormatCode(format?.kind === 'date' ? format : undefined, kind) }
  }
  catch {
    return null
  }
}

/**
 * 一个值写成单元格：缺失值为空；date / datetime 字段与日期格式的值换成 Excel 日期，解析不了的按原文写成文本；
 * 数值按数字格式写，其余按原值。
 */
function valueCell(value: unknown, type: FieldType | undefined, format: ValueFormat | undefined, ctx: Context, bold = false): XlsxCell | null {
  if (isMissing(value))
    return null
  const extra = bold ? { bold } : {}
  const dateLike = value instanceof Date || format?.kind === 'date' || ((type === 'date' || type === 'datetime') && format?.kind !== 'number')
  if (dateLike) {
    const cell = dateCell(value, type, format, ctx)
    if (cell)
      return { ...cell, ...extra }
  }
  if (typeof value === 'number')
    return format?.kind === 'number' ? { value, format: numberFormatCode(format), ...extra } : { value, ...extra }
  if (typeof value === 'string' || typeof value === 'boolean')
    return { value, ...extra }
  if (value instanceof Date)
    return { value: value.toISOString(), ...extra }
  let text: string
  try {
    text = JSON.stringify(value) ?? String(value)
  }
  catch {
    text = String(value)
  }
  return { value: text, ...extra }
}

function label(value: string): XlsxCell {
  return { value, bold: true }
}

function summaryCell(column: TableColumn, summary: ColumnSummary, value: unknown, ctx: Context, bold: boolean): XlsxCell | null {
  if ('aggregate' in summary) {
    if (summary.aggregate === 'count' || summary.aggregate === 'distinctCount')
      return isMissing(value) ? null : { value: value as number, format: COUNT_FORMAT, ...(bold ? { bold } : {}) }
    if (summary.aggregate === 'min' || summary.aggregate === 'max')
      return valueCell(value, fieldOf(ctx, column.field)?.type, column.format, ctx, bold)
  }
  return valueCell(value, undefined, column.format, ctx, bold)
}

function measureCell(measure: Measure, value: unknown, ctx: Context, bold: boolean): XlsxCell | null {
  if (isAggregateMeasure(measure)) {
    if (measure.aggregate === 'count' || measure.aggregate === 'distinctCount')
      return isMissing(value) ? null : { value: value as number, format: COUNT_FORMAT, ...(bold ? { bold } : {}) }
    if ((measure.aggregate === 'min' || measure.aggregate === 'max') && measure.field !== undefined)
      return valueCell(value, fieldOf(ctx, measure.field)?.type, measure.format, ctx, bold)
  }
  return valueCell(value, undefined, measure.format, ctx, bold)
}

function measureTitle(measure: Measure, ctx: Context): string {
  if (measure.title !== undefined)
    return measure.title
  if (isAggregateMeasure(measure) && measure.field !== undefined)
    return fieldTitle(ctx, measure.field, undefined)
  return measure.id
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

interface HeaderLabel {
  readonly id: string
  readonly cell: XlsxCell
}

interface Leaf {
  readonly tuple: number
  readonly measure: number | null
  readonly emphasis: boolean
  /** 各层的标签；null 表示被上一层的标签纵向合并。 */
  readonly labels: readonly (HeaderLabel | null)[]
}

function prefixId(keys: readonly unknown[], length: number): string {
  return `m${JSON.stringify(keys.slice(0, length).map(valueKey))}`
}

function axisLeaves(headers: readonly CrosstabHeader[], dimensions: readonly Dimension[], measures: readonly Measure[] | null, ctx: Context): Leaf[] {
  const leaves: Leaf[] = []
  headers.forEach((header, tuple) => {
    const labels: (HeaderLabel | null)[] = dimensions.map((dimension, level) => {
      const keyLabel = (): HeaderLabel => ({
        id: prefixId(header.keys, level + 1),
        cell: valueCell(header.keys[level], dimension.bucket ? undefined : fieldOf(ctx, dimension.field)?.type, dimension.format, ctx, true) ?? { value: null, bold: true },
      })
      if (header.kind === 'member')
        return keyLabel()
      if (header.kind === 'total')
        return level === 0 ? { id: 't', cell: label(ctx.t.total) } : null
      const depth = header.keys.length
      if (level < depth)
        return keyLabel()
      return level === depth ? { id: `s${prefixId(header.keys, depth)}`, cell: label(ctx.t.subtotal) } : null
    })
    const emphasis = header.kind !== 'member'
    if (!measures) {
      leaves.push({ tuple, measure: null, emphasis, labels })
      return
    }
    measures.forEach((measure, index) => {
      leaves.push({ tuple, measure: index, emphasis, labels: [...labels, { id: `${tuple}|${index}`, cell: label(measureTitle(measure, ctx)) }] })
    })
  })
  return leaves
}

/** 某一层上相邻的同一标签合并成一段：返回段的起点、长度与它向下（向内）跨过的层数。 */
function runs(leaves: readonly Leaf[], level: number, levels: number): { start: number, length: number, depth: number, label: HeaderLabel }[] {
  const result: { start: number, length: number, depth: number, label: HeaderLabel }[] = []
  let i = 0
  while (i < leaves.length) {
    const current = leaves[i]!.labels[level]
    if (!current) {
      i++
      continue
    }
    let j = i
    while (j + 1 < leaves.length && leaves[j + 1]!.labels[level]?.id === current.id)
      j++
    let depth = 1
    while (level + depth < levels && leaves[i]!.labels[level + depth] === null)
      depth++
    result.push({ start: i, length: j - i + 1, depth, label: current })
    i = j + 1
  }
  return result
}

/**
 * 交叉表排成工作表：左上角是表头区，上方是列轴的多层表头，左侧是行轴的多层表头，相同的上层成员合并单元格，
 * 小计与总计的标签向内合并；多个度量按 measuresOn 排在最内一层，没有列维度时列轴只有度量一层。
 * 行维度标题写在表头区最下一行，列维度标题写在表头区最右一列（与行维度标题同格时让给行维度标题）；冻结表头区。
 */
export function crosstabSheet(view: CrosstabView, result: CrosstabResult, options: SheetOptions): XlsxSheet {
  const ctx = context(options)
  const measures = view.measures
  const measuresOnRows = view.measuresOn === 'rows' && measures.length > 1
  const measureColumns = !measuresOnRows && (measures.length > 1 || view.columns.length === 0)
  const columnLeaves = axisLeaves(result.columns, view.columns, measureColumns ? measures : null, ctx)
  const rowLeaves = axisLeaves(result.rows, view.rows, measuresOnRows ? measures : null, ctx)
  const columnLevels = view.columns.length + (measureColumns ? 1 : 0)
  const rowLevels = view.rows.length + (measuresOnRows ? 1 : 0)
  const top = Math.max(columnLevels, 1)
  const left = rowLevels

  const rows: Cells[] = []
  const merges: XlsxMerge[] = []
  const set = (row: number, column: number, cell: XlsxCell | null): void => {
    (rows[row] ??= [])[column] = cell
  }

  for (let level = 0; level < columnLevels; level++) {
    for (const run of runs(columnLeaves, level, columnLevels)) {
      set(level, left + run.start, run.label.cell)
      if (run.length > 1 || run.depth > 1)
        merges.push({ row: level, column: left + run.start, rowSpan: run.depth, columnSpan: run.length })
    }
  }
  for (let level = 0; level < rowLevels; level++) {
    for (const run of runs(rowLeaves, level, rowLevels)) {
      set(top + run.start, level, run.label.cell)
      if (run.length > 1 || run.depth > 1)
        merges.push({ row: top + run.start, column: level, rowSpan: run.length, columnSpan: run.depth })
    }
  }

  view.rows.forEach((dimension, index) => {
    set(top - 1, index, label(fieldTitle(ctx, dimension.field, dimension.title)))
  })
  if (left > 0) {
    view.columns.forEach((dimension, index) => {
      if (index !== top - 1 || left - 1 >= view.rows.length)
        set(index, left - 1, label(fieldTitle(ctx, dimension.field, dimension.title)))
    })
  }

  rowLeaves.forEach((rowLeaf, r) => {
    columnLeaves.forEach((columnLeaf, c) => {
      const index = columnLeaf.measure ?? rowLeaf.measure ?? 0
      const measure = measures[index]
      if (!measure)
        return
      const value = result.cells[rowLeaf.tuple]?.[columnLeaf.tuple]?.[index]
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
