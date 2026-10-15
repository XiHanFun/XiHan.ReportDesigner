/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 工作簿模型与 OOXML 写出：内联字符串、样式表、合并单元格、列宽与冻结窗格。

import type { ZipCompression } from './zip'
import { XlsxError } from './errors'
import { cellRef, escapeCellText, escapeXml } from './xml'
import { zip } from './zip'

/** xlsx 的 MIME 类型。 */
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** 一个单元格。 */
export interface XlsxCell {
  /** 值：null 为空格子；NaN 写成空格子，Infinity 写成 #NUM!。 */
  readonly value: string | number | boolean | null
  /** Excel 数字格式代码，如 #,##0.00、yyyy-mm-dd；缺省 General。 */
  readonly format?: string
  readonly bold?: boolean
  readonly align?: 'left' | 'center' | 'right'
}

/** 一行：下标即列号，空位为空格子。 */
export type XlsxRow = readonly (XlsxCell | null | undefined)[]

/** 合并区：左上角的行列（0 起）与跨度。 */
export interface XlsxMerge {
  readonly row: number
  readonly column: number
  readonly rowSpan: number
  readonly columnSpan: number
}

/** 冻结窗格：顶部冻结的行数与左侧冻结的列数。 */
export interface XlsxFrozen {
  readonly rows: number
  readonly columns: number
}

/** 一张工作表。 */
export interface XlsxSheet {
  /** 表名：1–31 个字符，不含 [ ] : * ? / \，工作簿内不区分大小写地唯一。 */
  readonly name: string
  readonly rows: readonly XlsxRow[]
  readonly merges?: readonly XlsxMerge[]
  /** 列宽（字符数），下标即列号；空位用缺省宽度。 */
  readonly columnWidths?: readonly (number | null | undefined)[]
  readonly frozen?: XlsxFrozen
}

/** 工作簿。 */
export interface XlsxWorkbook {
  readonly sheets: readonly XlsxSheet[]
}

/** 写出选项。 */
export interface XlsxWriteOptions {
  /** 压缩方式，缺省 deflate；运行环境没有 CompressionStream 时 deflate 抛出 compression-unavailable。 */
  readonly compression?: ZipCompression
}

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const INVALID_NAME = /[[\]:*?/\\]/
const GENERAL = 'General'

/** 把任意文本整理成合法的表名：去掉不允许的字符、截到 31 个字符；结果为空时用 fallback。 */
export function sheetName(text: string, fallback = 'Sheet1'): string {
  const cleaned = text.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31).trim()
  return cleaned === '' ? fallback : cleaned
}

class StyleRegistry {
  readonly formats = new Map<string, number>()
  readonly styles = new Map<string, { numFmt: number, bold: boolean, align: XlsxCell['align'] }>()
  readonly order: string[] = []

  constructor() {
    this.styles.set('0|0|', { numFmt: 0, bold: false, align: undefined })
    this.order.push('0|0|')
  }

  index(cell: XlsxCell): number {
    const format = cell.format === undefined || cell.format === GENERAL ? 0 : this.format(cell.format)
    const key = `${format}|${cell.bold ? 1 : 0}|${cell.align ?? ''}`
    if (!this.styles.has(key)) {
      this.styles.set(key, { numFmt: format, bold: cell.bold === true, align: cell.align })
      this.order.push(key)
    }
    return this.order.indexOf(key)
  }

  private format(code: string): number {
    let id = this.formats.get(code)
    if (id === undefined) {
      id = 164 + this.formats.size
      this.formats.set(code, id)
    }
    return id
  }

  xml(): string {
    const numFmts = [...this.formats].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${escapeXml(code)}"/>`).join('')
    const xfs = this.order.map((key) => {
      const style = this.styles.get(key)!
      const attrs = `numFmtId="${style.numFmt}" fontId="${style.bold ? 1 : 0}" fillId="0" borderId="0" xfId="0"`
        + `${style.numFmt ? ' applyNumberFormat="1"' : ''}${style.bold ? ' applyFont="1"' : ''}${style.align ? ' applyAlignment="1"' : ''}`
      return style.align ? `<xf ${attrs}><alignment horizontal="${style.align}" vertical="center"/></xf>` : `<xf ${attrs}/>`
    }).join('')
    return `${XML_HEAD}<styleSheet xmlns="${MAIN_NS}">`
      + `${this.formats.size > 0 ? `<numFmts count="${this.formats.size}">${numFmts}</numFmts>` : ''}`
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${this.order.length}">${xfs}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>'
  }
}

function cellXml(cell: XlsxCell, ref: string, styles: StyleRegistry): string {
  const style = styles.index(cell)
  const s = style === 0 ? '' : ` s="${style}"`
  const { value } = cell
  if (value === null || (typeof value === 'number' && Number.isNaN(value)))
    return style === 0 ? '' : `<c r="${ref}"${s}/>`
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      return `<c r="${ref}"${s} t="e"><v>#NUM!</v></c>`
    return `<c r="${ref}"${s}><v>${value}</v></c>`
  }
  if (typeof value === 'boolean')
    return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeCellText(value)}</t></is></c>`
}

function checkMerges(sheet: XlsxSheet): void {
  const merges = sheet.merges ?? []
  merges.forEach((merge, index) => {
    const valid = [merge.row, merge.column, merge.rowSpan, merge.columnSpan].every(n => Number.isInteger(n))
      && merge.row >= 0 && merge.column >= 0 && merge.rowSpan >= 1 && merge.columnSpan >= 1
      && merge.rowSpan * merge.columnSpan > 1
    if (!valid)
      throw new XlsxError('invalid-merge', { sheet: sheet.name, merge: index })
    for (let other = 0; other < index; other++) {
      const b = merges[other]!
      if (merge.row < b.row + b.rowSpan && b.row < merge.row + merge.rowSpan && merge.column < b.column + b.columnSpan && b.column < merge.column + merge.columnSpan)
        throw new XlsxError('invalid-merge', { sheet: sheet.name, merge: index })
    }
  })
}

function sheetXml(sheet: XlsxSheet, styles: StyleRegistry): string {
  const parts: string[] = [`${XML_HEAD}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">`]
  const frozenRows = Math.max(0, Math.floor(sheet.frozen?.rows ?? 0))
  const frozenColumns = Math.max(0, Math.floor(sheet.frozen?.columns ?? 0))
  if (frozenRows > 0 || frozenColumns > 0) {
    const pane = frozenRows > 0 && frozenColumns > 0 ? 'bottomRight' : frozenRows > 0 ? 'bottomLeft' : 'topRight'
    const split = `${frozenColumns > 0 ? ` xSplit="${frozenColumns}"` : ''}${frozenRows > 0 ? ` ySplit="${frozenRows}"` : ''}`
    parts.push(`<sheetViews><sheetView workbookViewId="0"><pane${split} topLeftCell="${cellRef(frozenRows, frozenColumns)}" activePane="${pane}" state="frozen"/>`
      + `<selection pane="${pane}"/></sheetView></sheetViews>`)
  }
  else {
    parts.push('<sheetViews><sheetView workbookViewId="0"/></sheetViews>')
  }
  parts.push('<sheetFormatPr defaultRowHeight="15"/>')
  const widths = (sheet.columnWidths ?? [])
    .map((width, index) => (typeof width === 'number' && Number.isFinite(width) && width > 0
      ? `<col min="${index + 1}" max="${index + 1}" width="${Math.min(width, 255)}" customWidth="1"/>`
      : ''))
    .join('')
  if (widths !== '')
    parts.push(`<cols>${widths}</cols>`)
  parts.push('<sheetData>')
  sheet.rows.forEach((row, r) => {
    const cells = row.map((cell, c) => (cell ? cellXml(cell, cellRef(r, c), styles) : '')).join('')
    if (cells !== '')
      parts.push(`<row r="${r + 1}">${cells}</row>`)
  })
  parts.push('</sheetData>')
  const merges = sheet.merges ?? []
  if (merges.length > 0) {
    const refs = merges.map(merge => `<mergeCell ref="${cellRef(merge.row, merge.column)}:${cellRef(merge.row + merge.rowSpan - 1, merge.column + merge.columnSpan - 1)}"/>`).join('')
    parts.push(`<mergeCells count="${merges.length}">${refs}</mergeCells>`)
  }
  parts.push('</worksheet>')
  return parts.join('')
}

function checkSheets(workbook: XlsxWorkbook): void {
  if (workbook.sheets.length === 0)
    throw new XlsxError('empty-workbook')
  const names = new Set<string>()
  workbook.sheets.forEach((sheet, index) => {
    const { name } = sheet
    if (name.length === 0 || name.length > 31 || INVALID_NAME.test(name) || name.startsWith('\'') || name.endsWith('\''))
      throw new XlsxError('invalid-sheet-name', { sheet: index, name })
    const key = name.toLowerCase()
    if (names.has(key))
      throw new XlsxError('duplicate-sheet-name', { sheet: index, name })
    names.add(key)
    checkMerges(sheet)
  })
}

/**
 * 把工作簿写成 xlsx 文件的字节。只写最小的 OOXML 部件：内容类型、关系、工作簿、样式表与各工作表；
 * 字符串用内联字符串，不写共享字符串表。表名或合并区不合法时抛出 XlsxError。
 */
export async function writeXlsx(workbook: XlsxWorkbook, options: XlsxWriteOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  checkSheets(workbook)
  const styles = new StyleRegistry()
  const sheets = workbook.sheets.map(sheet => sheetXml(sheet, styles))
  const count = workbook.sheets.length
  const contentTypes = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    }<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
    + `</Types>`
  const rootRels = `${XML_HEAD}<Relationships xmlns="${PACKAGE_REL_NS}">`
    + `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>`
    + '</Relationships>'
  const workbookXml = `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><bookViews><workbookView/></bookViews><sheets>${
    workbook.sheets.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
  }</sheets></workbook>`
  const workbookRels = `${XML_HEAD}<Relationships xmlns="${PACKAGE_REL_NS}">${
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
  }<Relationship Id="rId${count + 1}" Type="${REL_NS}/styles" Target="styles.xml"/>`
  + `</Relationships>`
  const encoder = new TextEncoder()
  return zip([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rootRels) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    { name: 'xl/styles.xml', data: encoder.encode(styles.xml()) },
    ...sheets.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: encoder.encode(xml) })),
  ], options.compression ?? 'deflate')
}

/** 把 xlsx 字节包成 Blob。 */
export function xlsxBlob(bytes: Uint8Array<ArrayBuffer>): Blob {
  return new Blob([bytes], { type: XLSX_MIME })
}
