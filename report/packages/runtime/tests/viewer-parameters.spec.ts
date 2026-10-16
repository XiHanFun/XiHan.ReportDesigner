// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DatasetRequest, DatasetSchema, ReportDocument, TableView } from '@xihan-report/core'
import type { XhReportViewer } from '../src'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { defineReportViewer } from '../src'

const dataset: DatasetSchema = {
  id: 'sales',
  fields: [
    { name: 'region', type: 'string' },
    { name: 'amount', type: 'number' },
  ],
}

const view: TableView = {
  type: 'table',
  dataset: 'sales',
  columns: [{ id: 'region', field: 'region' }, { id: 'amount', field: 'amount' }],
  filter: { logic: 'and', conditions: [
    { id: 'r', field: 'region', operator: 'eq', value: { parameter: 'region' } },
    { id: 'a', field: 'amount', operator: 'gte', value: { parameter: 'minAmount' } },
  ] },
}

const schema = {
  schemaVersion: 1,
  id: 'demo',
  datasets: [dataset],
  parameters: [
    { name: 'region', type: 'string', title: '区域', options: [{ value: 'East', label: '东区' }, { value: 'West', label: '西区' }], defaultValue: 'East' },
    { name: 'minAmount', type: 'number', title: '最低金额' },
    { name: 'onlyActive', type: 'boolean', title: '只看有效' },
    { name: 'since', type: 'date', title: '起始日期' },
  ],
  body: view,
} as unknown as ReportDocument

beforeAll(() => {
  defineReportViewer()
})

afterEach(() => {
  document.body.replaceChildren()
})

async function mount(requests: DatasetRequest[], options: { controlled?: boolean, hidden?: boolean } = {}): Promise<XhReportViewer> {
  const viewer = document.createElement('xh-report-viewer') as XhReportViewer
  viewer.timeZone = 'UTC'
  if (options.hidden)
    viewer.setAttribute('hide-parameters', '')
  if (options.controlled)
    viewer.parameters = { region: 'East' }
  viewer.dataProvider = async (request) => {
    requests.push(request)
    return { kind: 'rows', rows: [] }
  }
  viewer.schema = schema
  document.body.append(viewer)
  await viewer.refresh()
  return viewer
}

function field(viewer: XhReportViewer, name: string): HTMLElement {
  return viewer.querySelector(`[data-part="parameter"][data-name="${name}"]`)!
}

describe('<xh-report-viewer>：参数栏', () => {
  it('按参数类型排成 UI 表单元素，候选项写成选项', async () => {
    const viewer = await mount([])
    const bar = viewer.querySelector('[data-part="parameters"]')!
    expect(bar.getAttribute('role')).toBe('group')
    expect(field(viewer, 'region').querySelector('xh-select')).not.toBeNull()
    expect([...field(viewer, 'region').querySelectorAll('[data-xh-part="item-text"]')].map(item => item.textContent)).toEqual(['东区', '西区'])
    expect(field(viewer, 'minAmount').querySelector('xh-number-field')).not.toBeNull()
    expect(field(viewer, 'onlyActive').querySelector('xh-switch')).not.toBeNull()
    expect(field(viewer, 'since').querySelector('xh-date-field')!.getAttribute('granularity')).toBe('day')
    expect(field(viewer, 'minAmount').querySelector('[data-xh-part="label"]')!.textContent).toBe('最低金额')
  })

  it('改了参数：派发 parameters-change，不受控时按新参数重新取数', async () => {
    const requests: DatasetRequest[] = []
    const viewer = await mount(requests)
    const changes: unknown[] = []
    viewer.addEventListener('parameters-change', event => changes.push((event as CustomEvent).detail.value))
    const select = field(viewer, 'region').querySelector('xh-select')!
    select.dispatchEvent(new CustomEvent('value-change', { detail: { value: ['o1'] } }))
    await viewer.refresh()
    expect(changes).toEqual([{ region: 'West' }])
    expect(JSON.stringify(requests.at(-1)!.filter)).toContain('West')

    const input = field(viewer, 'minAmount').querySelector('input')!
    input.value = '120'
    input.dispatchEvent(new Event('change'))
    await viewer.refresh()
    expect(changes.at(-1)).toEqual({ region: 'West', minAmount: 120 })
    expect(JSON.stringify(requests.at(-1)!.filter)).toContain('120')

    input.value = ''
    input.dispatchEvent(new Event('change'))
    expect(changes.at(-1)).toEqual({ region: 'West', minAmount: null })
  })

  it('受控的 parameters 只派发事件，参数栏自己的改动写回时不重排', async () => {
    const requests: DatasetRequest[] = []
    const viewer = await mount(requests, { controlled: true })
    const before = requests.length
    const bar = viewer.querySelector('[data-part="parameters"]')
    const changes: unknown[] = []
    viewer.addEventListener('parameters-change', event => changes.push((event as CustomEvent).detail.value))
    field(viewer, 'region').querySelector('xh-select')!.dispatchEvent(new CustomEvent('value-change', { detail: { value: ['o1'] } }))
    expect(changes).toEqual([{ region: 'West' }])
    expect(requests).toHaveLength(before)
    viewer.parameters = { region: 'West' }
    await viewer.updateComplete
    await viewer.refresh()
    expect(viewer.querySelector('[data-part="parameters"]')).toBe(bar)
    expect(JSON.stringify(requests.at(-1)!.filter)).toContain('West')
  })

  it('hide-parameters 时不排参数栏', async () => {
    const viewer = await mount([], { hidden: true })
    expect(viewer.querySelector('[data-part="parameters"]')).toBeNull()
  })
})
