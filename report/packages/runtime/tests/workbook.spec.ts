/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { XlsxSheet } from '../src/xlsx'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sheetName, writeXlsx, XLSX_MIME, xlsxBlob, XlsxError } from '../src/xlsx'
import { unzip } from './unzip'

const PARTS = [
  '[Content_Types].xml',
  '_rels/.rels',
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  'xl/styles.xml',
  'xl/worksheets/sheet1.xml',
]

const sheet: XlsxSheet = {
  name: '销售',
  rows: [
    [{ value: '区域', bold: true }, { value: '金额', bold: true, align: 'center' }, { value: '有效', bold: true }],
    [{ value: '东区' }, { value: 1234.5, format: '#,##0.00' }, { value: true }],
    [{ value: '西区' }, { value: Number.NaN }, { value: false }, null, { value: Number.POSITIVE_INFINITY }],
    [],
    [{ value: null, bold: true }, undefined, { value: 46311.5, format: 'yyyy-mm-dd hh:mm' }],
  ],
  merges: [{ row: 3, column: 0, rowSpan: 1, columnSpan: 3 }],
  columnWidths: [12, undefined, 8],
  frozen: { rows: 1, columns: 1 },
}

async function read(sheets: readonly XlsxSheet[], compression: 'store' | 'deflate' = 'store'): Promise<Map<string, string>> {
  const entries = unzip(await writeXlsx({ sheets }, { compression }))
  return new Map([...entries].map(([name, entry]) => [name, entry.text]))
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  }
  catch (error) {
    return error instanceof XlsxError ? [error.code, error.params] : error
  }
  return null
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('writeXlsx：包结构', () => {
  it('store 与 deflate 都只写最小部件，大小与 CRC 校验通过', async () => {
    for (const compression of ['store', 'deflate'] as const) {
      const entries = unzip(await writeXlsx({ sheets: [sheet] }, { compression }))
      expect([...entries.keys()]).toEqual(PARTS)
      for (const entry of entries.values())
        expect(entry.method).toBe(compression === 'store' ? 0 : entry.compressedSize < entry.data.length ? 8 : 0)
    }
  })

  it('deflate 压缩重复内容明显变小', async () => {
    const big: XlsxSheet = { name: 'big', rows: Array.from({ length: 500 }, (_, r) => [{ value: `row ${r % 7}` }, { value: r }]) }
    const stored = await writeXlsx({ sheets: [big] }, { compression: 'store' })
    const deflated = await writeXlsx({ sheets: [big] })
    expect(deflated.length).toBeLessThan(stored.length / 3)
    expect(unzip(deflated).get('xl/worksheets/sheet1.xml')!.text).toBe(unzip(stored).get('xl/worksheets/sheet1.xml')!.text)
  })

  it('store 方式同一输入的字节完全相同', async () => {
    expect(await writeXlsx({ sheets: [sheet] }, { compression: 'store' })).toEqual(await writeXlsx({ sheets: [sheet] }, { compression: 'store' }))
  })

  it('内容类型、关系与工作簿彼此对应', async () => {
    const files = await read([sheet, { name: 'Two & <More>', rows: [] }])
    expect(files.get('[Content_Types].xml')).toContain('<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
    expect(files.get('[Content_Types].xml')).toContain('PartName="/xl/styles.xml"')
    expect(files.get('_rels/.rels')).toContain('Target="xl/workbook.xml"')
    expect(files.get('xl/workbook.xml')).toContain('<sheet name="销售" sheetId="1" r:id="rId1"/><sheet name="Two &amp; &lt;More&gt;" sheetId="2" r:id="rId2"/>')
    expect(files.get('xl/_rels/workbook.xml.rels')).toContain('<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>')
  })

  it('运行环境没有 CompressionStream 时 deflate 抛出，store 照常', async () => {
    vi.stubGlobal('CompressionStream', undefined)
    expect(await rejection(writeXlsx({ sheets: [sheet] }))).toEqual(['compression-unavailable', {}])
    expect((await writeXlsx({ sheets: [sheet] }, { compression: 'store' })).length).toBeGreaterThan(0)
  })

  it('xlsxBlob 带 MIME 类型', async () => {
    const bytes = await writeXlsx({ sheets: [sheet] }, { compression: 'store' })
    const blob = xlsxBlob(bytes)
    expect(blob.type).toBe(XLSX_MIME)
    expect(blob.size).toBe(bytes.length)
  })
})

describe('writeXlsx：工作表', () => {
  it('单元格按类型写出，空值与 NaN 不写，Infinity 写成 #NUM!', async () => {
    const xml = (await read([sheet])).get('xl/worksheets/sheet1.xml')!
    expect(xml).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">东区</t></is></c>')
    expect(xml).toMatch(/<c r="B2" s="\d+"><v>1234.5<\/v><\/c>/)
    expect(xml).toContain('<c r="C2" t="b"><v>1</v></c>')
    expect(xml).toContain('<c r="C3" t="b"><v>0</v></c>')
    expect(xml).not.toContain('r="B3"')
    expect(xml).toContain('<c r="E3" t="e"><v>#NUM!</v></c>')
    expect(xml).not.toContain('<row r="4"')
    expect(xml).toMatch(/<row r="5"><c r="A5" s="\d+"\/><c r="C5" s="\d+"><v>46311.5<\/v><\/c><\/row>/)
  })

  it('冻结窗格、列宽与合并单元格', async () => {
    const xml = (await read([sheet])).get('xl/worksheets/sheet1.xml')!
    expect(xml).toContain('<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/>')
    expect(xml).toContain('<cols><col min="1" max="1" width="12" customWidth="1"/><col min="3" max="3" width="8" customWidth="1"/></cols>')
    expect(xml).toContain('<mergeCells count="1"><mergeCell ref="A4:C4"/></mergeCells>')
    const rowsOnly = (await read([{ name: 'a', rows: [], frozen: { rows: 2, columns: 0 } }])).get('xl/worksheets/sheet1.xml')!
    expect(rowsOnly).toContain('<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/>')
  })

  it('样式表登记自定义数字格式、粗体与对齐', async () => {
    const styles = (await read([sheet])).get('xl/styles.xml')!
    expect(styles).toContain('<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/></numFmts>')
    expect(styles).toContain('<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>')
    expect(styles).toContain('<alignment horizontal="center" vertical="center"/>')
    expect(styles).toMatch(/<cellXfs count="5">/)
  })

  it('转义 XML 特殊字符、字面的 _xHHHH_ 与非法字符', async () => {
    const xml = (await read([{ name: 'a', rows: [[{ value: '<a & "b">' }, { value: '_x0041_' }, { value: 'a\u0001b\uD800c' }, { value: '😀\t\n' }]] }])).get('xl/worksheets/sheet1.xml')!
    expect(xml).toContain('<t xml:space="preserve">&lt;a &amp; &quot;b&quot;&gt;</t>')
    expect(xml).toContain('<t xml:space="preserve">_x005F_x0041_</t>')
    expect(xml).toContain('<t xml:space="preserve">a_x0001_b_xD800_c</t>')
    expect(xml).toContain('<t xml:space="preserve">😀\t\n</t>')
  })

  it('列字母越过 Z 后进位', async () => {
    const row = Array.from({ length: 54 }, (_, i) => ({ value: i }))
    const xml = (await read([{ name: 'a', rows: [row] }])).get('xl/worksheets/sheet1.xml')!
    expect(xml).toContain('<c r="Z1"><v>25</v></c><c r="AA1"><v>26</v></c>')
    expect(xml).toContain('<c r="AZ1"><v>51</v></c><c r="BA1"><v>52</v></c><c r="BB1"><v>53</v></c>')
  })
})

describe('writeXlsx：检查', () => {
  it('空工作簿、非法与重复的表名、不合法与重叠的合并区都抛出', async () => {
    expect(await rejection(writeXlsx({ sheets: [] }))).toEqual(['empty-workbook', {}])
    expect(await rejection(writeXlsx({ sheets: [{ name: 'a/b', rows: [] }] }))).toEqual(['invalid-sheet-name', { sheet: 0, name: 'a/b' }])
    expect(await rejection(writeXlsx({ sheets: [{ name: 'x'.repeat(32), rows: [] }] }))).toEqual(['invalid-sheet-name', { sheet: 0, name: 'x'.repeat(32) }])
    expect(await rejection(writeXlsx({ sheets: [{ name: 'Data', rows: [] }, { name: 'data', rows: [] }] }))).toEqual(['duplicate-sheet-name', { sheet: 1, name: 'data' }])
    expect(await rejection(writeXlsx({ sheets: [{ name: 'a', rows: [], merges: [{ row: 0, column: 0, rowSpan: 1, columnSpan: 1 }] }] }))).toEqual(['invalid-merge', { sheet: 'a', merge: 0 }])
    expect(await rejection(writeXlsx({
      sheets: [{ name: 'a', rows: [], merges: [{ row: 0, column: 0, rowSpan: 2, columnSpan: 2 }, { row: 1, column: 1, rowSpan: 1, columnSpan: 2 }] }],
    }))).toEqual(['invalid-merge', { sheet: 'a', merge: 1 }])
  })

  it('sheetName 把任意文本整理成合法表名', () => {
    expect(sheetName('2026/10 销售[汇总]')).toBe('2026 10 销售 汇总')
    expect(sheetName('  ')).toBe('Sheet1')
    expect(sheetName('\'quoted\'')).toBe('quoted')
    expect(sheetName('x'.repeat(40))).toHaveLength(31)
  })
})
