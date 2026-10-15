/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { CrosstabView, DatasetRows, DatasetSchema, GroupView, TableView } from '@xihan-report/core'
import type { XlsxCell, XlsxSheet } from '@xihan-ui/xlsx'
import { buildCrosstab, buildGroupReport, buildTable } from '@xihan-report/core'
import { formatValue } from '@xihan-ui/expression'
import { writeXlsx } from '@xihan-ui/xlsx'
import { describe, expect, it } from 'vitest'
import { crosstabSheet, groupSheet, tableSheet } from '../src/xlsx'
import { unzip } from './unzip'

const dataset: DatasetSchema = {
  id: 'sales',
  fields: [
    { name: 'region', type: 'string', title: '区域' },
    { name: 'product', type: 'string', title: '产品' },
    { name: 'date', type: 'date', title: '日期' },
    { name: 'amount', type: 'number', title: '金额' },
    { name: 'qty', type: 'number', title: '数量' },
  ],
}

const data: DatasetRows = {
  kind: 'rows',
  rows: [
    { region: 'East', product: 'A', date: '2026-01-15', amount: 100, qty: 1 },
    { region: 'East', product: 'B', date: '2026-02-03', amount: 50, qty: 2 },
    { region: 'West', product: 'A', date: '2026-01-20', amount: 80, qty: 1 },
    { region: 'West', product: 'B', date: 'soon', amount: 20, qty: 3 },
  ],
}

function show(cell: XlsxCell | null | undefined): unknown {
  if (!cell)
    return null
  if (cell.type !== 'date')
    return cell.value
  const { year, month, day } = cell.value
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function values(sheet: XlsxSheet): unknown[][] {
  return sheet.rows.map(row => Array.from(row, show))
}

describe('tableSheet', () => {
  const view: TableView = {
    type: 'table',
    dataset: 'sales',
    columns: [
      { id: 'date', field: 'date', width: 84 },
      { id: 'region', field: 'region', title: '大区' },
      { id: 'amount', field: 'amount', format: { kind: 'number', decimals: 2, grouping: true }, summary: { aggregate: 'sum' } },
      { id: 'qty', field: 'qty', summary: { aggregate: 'count' } },
    ],
  }
  const sheet = tableSheet(view, buildTable(view, dataset, data), { dataset, name: '明细/2026' })

  it('首行列标题，日期换成 Excel 日期，解析不了的按原文，末行合计', () => {
    expect(sheet.name).toBe('明细 2026')
    expect(values(sheet)).toEqual([
      ['日期', '大区', '金额', '数量'],
      ['2026-01-15', 'East', 100, 1],
      ['2026-02-03', 'East', 50, 2],
      ['2026-01-20', 'West', 80, 1],
      ['soon', 'West', 20, 3],
      ['Total', null, 250, 4],
    ])
    expect(sheet.rows[1]![0]).toEqual({ type: 'date', value: { year: 2026, month: 1, day: 15 } })
    expect(sheet.rows[4]![0]).toEqual({ type: 'text', value: 'soon' })
    expect(sheet.rows[1]![2]).toEqual({ type: 'number', value: 100, format: '#,##0.00' })
    expect(sheet.rows[5]![2]).toEqual({ type: 'number', value: 250, format: '#,##0.00', bold: true })
    expect(sheet.rows[5]![3]).toEqual({ type: 'number', value: 4, format: '#,##0', bold: true })
    expect(sheet.columnWidths).toEqual([12, undefined, undefined, undefined])
    expect(sheet.frozen).toEqual({ rows: 1, columns: 0 })
  })

  it('infinity 与 1900 年之前的日期写成文本，日期时间带时刻', () => {
    const odd: DatasetRows = {
      kind: 'rows',
      rows: [
        { date: '1899-12-31', amount: Number.POSITIVE_INFINITY },
        { date: '2026-10-16T08:30:00Z', amount: 1 },
      ],
    }
    const stamped: DatasetSchema = { ...dataset, fields: dataset.fields.map(field => (field.name === 'date' ? { ...field, type: 'datetime' as const } : field)) }
    const view: TableView = { type: 'table', dataset: 'sales', columns: [{ id: 'date', field: 'date' }, { id: 'amount', field: 'amount' }] }
    const sheet = tableSheet(view, buildTable(view, stamped, odd), { dataset: stamped, timeZone: 'Asia/Shanghai' })
    expect(sheet.rows[1]).toEqual([{ type: 'text', value: '1899-12-31' }, { type: 'text', value: 'Infinity' }])
    expect(sheet.rows[2]![0]).toEqual({
      type: 'date',
      value: { year: 2026, month: 10, day: 16, hour: 16, minute: 30, second: 0, millisecond: 0 },
    })
  })

  it('格式说明经 formatCode 换成格式代码，Excel 表达不了时写成 formatValue 的文本', () => {
    const rows: DatasetRows = {
      kind: 'rows',
      rows: [{ date: '2026-10-16T08:30:00', amount: 1001.5, qty: 2.345 }],
    }
    const stamped: DatasetSchema = { ...dataset, fields: dataset.fields.map(field => (field.name === 'date' ? { ...field, type: 'datetime' as const } : field)) }
    const view: TableView = {
      type: 'table',
      dataset: 'sales',
      columns: [
        { id: 'day', field: 'date', format: { kind: 'date', pattern: 'yyyy年M月d日' } },
        { id: 'clock', field: 'date', format: { kind: 'date', pattern: 'HH:MM' } },
        { id: 'upper', field: 'amount', format: { kind: 'rmb-upper' } },
        { id: 'share', field: 'amount', format: { kind: 'percent' } },
        { id: 'even', field: 'qty', format: { kind: 'number', decimals: 2, rounding: 'half-even' } },
        { id: 'plain', field: 'qty', format: { kind: 'number', decimals: 2 } },
      ],
    }
    const [cells] = tableSheet(view, buildTable(view, stamped, rows), { dataset: stamped }).rows.slice(1)
    expect(cells).toEqual([
      { type: 'date', value: { year: 2026, month: 10, day: 16, hour: 8, minute: 30, second: 0, millisecond: 0 }, format: 'yyyy"年"m"月"d"日"' },
      { type: 'text', value: '08:10' },
      { type: 'text', value: '壹仟零壹元伍角' },
      { type: 'text', value: '100150%' },
      { type: 'number', value: 2.34, format: '0.00' },
      { type: 'number', value: 2.345, format: '0.00' },
    ])
  })

  it('数字字形格式写成 formatValue 的文本', () => {
    const rows: DatasetRows = { kind: 'rows', rows: [{ date: '2026-10-16', amount: 12, qty: 4 }] }
    const view: TableView = {
      type: 'table',
      dataset: 'sales',
      columns: [
        { id: 'roman', field: 'amount', format: { kind: 'numeral', style: 'roman-upper' } },
        { id: 'chinese', field: 'qty', format: { kind: 'numeral', style: 'cn-upper' } },
      ],
    }
    const [cells] = tableSheet(view, buildTable(view, dataset, rows), { dataset }).rows.slice(1)
    expect(cells).toEqual([
      { type: 'text', value: 'XII' },
      { type: 'text', value: formatValue(4, { kind: 'numeral', style: 'cn-upper' }) },
    ])
  })

  it('内建文字可以替换', () => {
    const translated = tableSheet(view, buildTable(view, dataset, data), { dataset, translations: { total: '合计' } })
    expect(translated.rows.at(-1)![0]).toEqual({ type: 'text', value: '合计', bold: true })
    expect(translated.name).toBe('Sheet1')
  })
})

describe('groupSheet', () => {
  const view: GroupView = {
    type: 'group',
    dataset: 'sales',
    groups: [{ id: 'region', field: 'region' }],
    columns: [
      { id: 'product', field: 'product' },
      { id: 'amount', field: 'amount', summary: { aggregate: 'sum' } },
      { id: 'qty', field: 'qty', summary: { aggregate: 'sum' } },
    ],
  }

  it('组头、明细、组小计与总计', () => {
    const sheet = groupSheet(view, buildGroupReport(view, dataset, data), { dataset })
    expect(values(sheet)).toEqual([
      ['区域', '产品', '金额', '数量'],
      ['East'],
      [null, 'A', 100, 1],
      [null, 'B', 50, 2],
      ['Subtotal', null, 150, 3],
      ['West'],
      [null, 'A', 80, 1],
      [null, 'B', 20, 3],
      ['Subtotal', null, 100, 4],
      ['Total', null, 250, 7],
    ])
    expect(sheet.rows[1]![0]).toEqual({ type: 'text', value: 'East', bold: true })
    expect(sheet.rows[4]![2]).toEqual({ type: 'number', value: 150, bold: true })
  })

  it('不列明细时每组一行，关掉组头时小计行写组的键', () => {
    const summary = groupSheet({ ...view, detail: false }, buildGroupReport({ ...view, detail: false }, dataset, data), { dataset })
    expect(values(summary)).toEqual([
      ['区域', '产品', '金额', '数量'],
      ['East', null, 150, 3],
      ['West', null, 100, 4],
      ['Total', null, 250, 7],
    ])
    const months: GroupView = { ...view, groups: [{ id: 'quarter', field: 'date', bucket: 'quarter', header: false }, { id: 'region', field: 'region' }], detail: false }
    const nested = groupSheet(months, buildGroupReport(months, dataset, { kind: 'rows', rows: data.rows.slice(0, 3) }), { dataset })
    expect(values(nested)).toEqual([
      ['日期', '区域', '产品', '金额', '数量'],
      [null, 'East', null, 150, 3],
      [null, 'West', null, 80, 1],
      ['2026-Q1', null, null, 230, 4],
      ['Total', null, null, 230, 4],
    ])
  })
})

describe('crosstabSheet', () => {
  const base: CrosstabView = {
    type: 'crosstab',
    dataset: 'sales',
    rows: [{ id: 'region', field: 'region' }],
    columns: [{ id: 'product', field: 'product' }],
    measures: [
      { id: 'amount', aggregate: 'sum', field: 'amount' },
      { id: 'qty', aggregate: 'sum', field: 'qty', title: '件数' },
    ],
  }

  it('度量排在列方向：列轴两层表头，上层成员横向合并', () => {
    const sheet = crosstabSheet(base, buildCrosstab(base, dataset, data), { dataset })
    expect(values(sheet)).toEqual([
      ['产品', 'A', null, 'B', null, 'Total'],
      ['区域', '金额', '件数', '金额', '件数', '金额', '件数'],
      ['East', 100, 1, 50, 2, 150, 3],
      ['West', 80, 1, 20, 3, 100, 4],
      ['Total', 180, 2, 70, 5, 250, 7],
    ])
    expect(sheet.merges).toEqual([
      { row: 0, column: 1, rowSpan: 1, columnSpan: 2 },
      { row: 0, column: 3, rowSpan: 1, columnSpan: 2 },
      { row: 0, column: 5, rowSpan: 1, columnSpan: 2 },
    ])
    expect(sheet.frozen).toEqual({ rows: 2, columns: 1 })
    expect(sheet.rows[2]![5]).toEqual({ type: 'number', value: 150, bold: true })
    expect(sheet.rows[2]![1]).toEqual({ type: 'number', value: 100 })
  })

  it('多层行维度：上层成员纵向合并，小计与总计标签向内合并', () => {
    const view: CrosstabView = {
      ...base,
      rows: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }],
      columns: [],
      measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }],
      rowTotals: { subtotals: true },
    }
    const sheet = crosstabSheet(view, buildCrosstab(view, dataset, data), { dataset })
    expect(values(sheet)).toEqual([
      ['区域', '产品', '金额'],
      ['East', 'A', 100],
      [null, 'B', 50],
      [null, 'Subtotal', 150],
      ['West', 'A', 80],
      [null, 'B', 20],
      [null, 'Subtotal', 100],
      ['Total', null, 250],
    ])
    expect(sheet.merges).toEqual([
      { row: 1, column: 0, rowSpan: 3, columnSpan: 1 },
      { row: 4, column: 0, rowSpan: 3, columnSpan: 1 },
      { row: 7, column: 0, rowSpan: 1, columnSpan: 2 },
    ])
    expect(sheet.frozen).toEqual({ rows: 1, columns: 2 })
  })

  it('度量排在行方向，列轴的小计标签纵向合并', () => {
    const view: CrosstabView = {
      ...base,
      columns: [{ id: 'quarter', field: 'date', bucket: 'quarter' }, { id: 'product', field: 'product' }],
      measuresOn: 'rows',
      columnTotals: { subtotals: true, grandTotal: false },
    }
    const rows = { kind: 'rows' as const, rows: data.rows.slice(0, 3) }
    const sheet = crosstabSheet(view, buildCrosstab(view, dataset, rows), { dataset })
    expect(values(sheet)).toEqual([
      [null, '日期', '2026-Q1'],
      ['区域', '产品', 'A', 'B', 'Subtotal'],
      ['East', '金额', 100, 50, 150],
      [null, '件数', 1, 2, 3],
      ['West', '金额', 80, null, 80],
      [null, '件数', 1, null, 1],
      ['Total', '金额', 180, 50, 230],
      [null, '件数', 2, 2, 4],
    ])
    expect(sheet.merges).toEqual([
      { row: 0, column: 2, rowSpan: 1, columnSpan: 3 },
      { row: 2, column: 0, rowSpan: 2, columnSpan: 1 },
      { row: 4, column: 0, rowSpan: 2, columnSpan: 1 },
      { row: 6, column: 0, rowSpan: 2, columnSpan: 1 },
    ])
  })
})

describe('导出整个工作簿', () => {
  it('三种视图写进同一个 xlsx，解压后结构完整', async () => {
    const table: TableView = { type: 'table', dataset: 'sales', columns: [{ id: 'amount', field: 'amount', format: { kind: 'number', decimals: 2, grouping: true } }] }
    const group: GroupView = { type: 'group', dataset: 'sales', groups: [{ id: 'region', field: 'region' }], columns: [{ id: 'amount', field: 'amount', summary: { aggregate: 'sum' } }] }
    const crosstab: CrosstabView = { type: 'crosstab', dataset: 'sales', rows: [{ id: 'region', field: 'region' }], columns: [{ id: 'product', field: 'product' }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }, { id: 'qty', aggregate: 'sum', field: 'qty' }] }
    const bytes = await writeXlsx({
      sheets: [
        tableSheet(table, buildTable(table, dataset, data), { dataset, name: '明细' }),
        groupSheet(group, buildGroupReport(group, dataset, data), { dataset, name: '分组' }),
        crosstabSheet(crosstab, buildCrosstab(crosstab, dataset, data), { dataset, name: '交叉' }),
      ],
    })
    const files = unzip(bytes)
    expect([...files.keys()]).toContain('xl/worksheets/sheet3.xml')
    expect(files.get('xl/workbook.xml')!.text).toContain('<sheet name="明细" sheetId="1" r:id="rId1"/><sheet name="分组" sheetId="2" r:id="rId2"/><sheet name="交叉" sheetId="3" r:id="rId3"/>')
    expect(files.get('xl/styles.xml')!.text).toContain('formatCode="#,##0.00"')
    expect(files.get('xl/worksheets/sheet3.xml')!.text).toContain('<mergeCells count="3"><mergeCell ref="B1:C1"/><mergeCell ref="D1:E1"/><mergeCell ref="F1:G1"/></mergeCells>')
    expect(files.get('xl/worksheets/sheet3.xml')!.text).toContain('<pane xSplit="1" ySplit="2" topLeftCell="B3" activePane="bottomRight" state="frozen"/>')
  })
})
