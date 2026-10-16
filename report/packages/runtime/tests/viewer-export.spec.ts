// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DatasetSchema, ReportDocument, TableView } from '@xihan-report/core'
import type { XhReportViewer } from '../src'
import { Blob as NodeBlob } from 'node:buffer'
import { XLSX_MIME } from '@xihan-ui/xlsx'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineReportViewer } from '../src'
import { unzip } from './unzip'

defineReportViewer()

// jsdom 的 Blob 没有 stream()，压缩写出改用 Node 的 Blob。
beforeAll(() => {
  vi.stubGlobal('Blob', NodeBlob)
})

afterEach(() => {
  document.body.replaceChildren()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

const dataset: DatasetSchema = {
  id: 'sales',
  fields: [{ name: 'region', type: 'string', title: '区域' }, { name: 'amount', type: 'number', title: '金额' }],
}

const table: TableView = {
  type: 'table',
  dataset: 'sales',
  columns: [{ id: 'region', field: 'region' }, { id: 'amount', field: 'amount', summary: { aggregate: 'sum' } }],
}

async function mount(body: ReportDocument['body'], title?: string): Promise<XhReportViewer> {
  const viewer = document.createElement('xh-report-viewer') as XhReportViewer
  viewer.timeZone = 'UTC'
  viewer.translations = { total: '合计' }
  viewer.dataProvider = async () => ({ kind: 'rows', rows: [{ region: 'East', amount: 10 }, { region: 'West', amount: 5 }] })
  viewer.schema = { schemaVersion: 1, id: 'demo', ...(title ? { title } : {}), datasets: [dataset], body } as ReportDocument
  document.body.append(viewer)
  await viewer.refresh()
  return viewer
}

async function files(blob: Blob): Promise<Map<string, { text: string }>> {
  return unzip(new Uint8Array(await blob.arrayBuffer()))
}

describe('<xh-report-viewer>：导出 xlsx', () => {
  it('表格主体导出一张表，表名取报表标题，合计用查看器的文案', async () => {
    const viewer = await mount(table, '销售明细')
    const blob = await viewer.exportXlsx()
    expect(blob.type).toBe(XLSX_MIME)
    const zip = await files(blob)
    expect(zip.get('xl/workbook.xml')!.text).toContain('name="销售明细"')
    const sheet = zip.get('xl/worksheets/sheet1.xml')!.text
    expect(sheet).toContain('East')
    expect(sheet).toContain('合计')
  })

  it('看板按表格卡片各导一张，同名的表名加序号', async () => {
    const card = (id: string, title: string, y: number): object => ({ id, kind: 'table', title, layout: { x: 0, y, w: 6, h: 4 }, view: table })
    const viewer = await mount({
      type: 'dashboard',
      grid: { columns: 12, rowHeight: 40 },
      cards: [card('a', '明细', 0), card('b', '明细', 4), { id: 'm', kind: 'metric', layout: { x: 6, y: 0, w: 6, h: 4 }, dataset: 'sales', query: { dimensions: [], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] }, metric: { value: 'amount' } }],
    } as ReportDocument['body'])
    const workbook = (await files(await viewer.exportXlsx())).get('xl/workbook.xml')!.text
    expect(workbook).toContain('name="明细"')
    expect(workbook).toContain('name="明细 (2)"')
    expect(workbook.match(/<sheet /g)).toHaveLength(2)
  })

  it('还没有可导出的结果时抛 RangeError', async () => {
    const viewer = document.createElement('xh-report-viewer') as XhReportViewer
    document.body.append(viewer)
    await expect(viewer.exportXlsx()).rejects.toBeInstanceOf(RangeError)
  })
})
