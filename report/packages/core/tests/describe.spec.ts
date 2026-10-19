/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { ReportOperation } from '../src'
import { describe, expect, it } from 'vitest'
import { describeReportStep } from '../src'
import { dashboardDocument, groupDocument } from './documents'

const step = (operations: readonly ReportOperation[], before = dashboardDocument): unknown => describeReportStep(operations, before)

describe('describeReportStep', () => {
  it('按第一个操作定动作与对象种类，只改一个对象时带上它的标题，没有标题时取 id 或字段名', () => {
    expect(step([{ type: 'removeCard', id: 'trend' }])).toEqual({ action: 'remove', kind: 'card', name: '月度走势', count: 1 })
    expect(step([{ type: 'updateCard', id: 'kpi', changes: [{ path: ['title'], value: 'x' }] }])).toEqual({ action: 'update', kind: 'card', name: 'kpi', count: 1 })
    expect(step([{ type: 'addField', dataset: 'sales', field: { name: 'cost', type: 'number' } }])).toEqual({ action: 'add', kind: 'field', name: 'cost', count: 1 })
    expect(step([{ type: 'updateField', dataset: 'sales', name: 'amount', changes: [] }])).toEqual({ action: 'update', kind: 'field', name: '金额', count: 1 })
    expect(step([{ type: 'moveDataset', id: 'sales', index: 0 }])).toEqual({ action: 'move', kind: 'dataset', name: '销售', count: 1 })
    expect(step([{ type: 'removeParameter', name: 'year' }])).toEqual({ action: 'remove', kind: 'parameter', name: 'year', count: 1 })
    expect(step([{ type: 'updateDocument', changes: [] }])).toEqual({ action: 'update', kind: 'document', name: '销售看板', count: 1 })
    expect(step([{ type: 'updateDashboard', changes: [] }])).toEqual({ action: 'update', kind: 'dashboard', count: 1 })
  })

  it('列表项按所在列表定种类，名字取标题，其次字段名；找不到时取 id', () => {
    expect(step([{ type: 'removeItem', card: 'trend', list: 'dimensions', id: 'region' }])).toEqual({ action: 'remove', kind: 'dimension', name: 'region', count: 1 })
    expect(step([{ type: 'moveItem', card: 'trend', list: 'measures', id: 'amount', index: 0 }])).toEqual({ action: 'move', kind: 'measure', name: 'amount', count: 1 })
    expect(step([{ type: 'updateItem', card: 'trend', list: 'series', id: 'bars', changes: [] }])).toEqual({ action: 'update', kind: 'series', name: 'bars', count: 1 })
    expect(step([{ type: 'addItem', list: 'groups', item: { id: 'g2', field: 'product', title: '按产品' } }], groupDocument)).toEqual({ action: 'add', kind: 'group', name: '按产品', count: 1 })
    expect(step([{ type: 'removeItem', card: 'ghost', list: 'dimensions', id: 'nope' }])).toEqual({ action: 'remove', kind: 'dimension', name: 'nope', count: 1 })
  })

  it('同一步里同动作、同种类的对象合起来计个数，个数大于 1 时不带名字；布局按改了几张卡片计', () => {
    expect(step([
      { type: 'removeCard', id: 'trend' },
      { type: 'removeLink', id: 'l1' },
      { type: 'removeCard', id: 'kpi' },
      { type: 'removeCard', id: 'trend' },
    ])).toEqual({ action: 'remove', kind: 'card', count: 2 })
    expect(step([{ type: 'layoutCards', layouts: { trend: { x: 0, y: 0, w: 4, h: 3 } } }])).toEqual({ action: 'layout', kind: 'card', name: '月度走势', count: 1 })
    expect(step([{ type: 'layoutCards', layouts: { trend: { x: 0, y: 0, w: 4, h: 3 }, kpi: { x: 4, y: 0, w: 4, h: 3 } } }])).toEqual({ action: 'layout', kind: 'card', count: 2 })
  })

  it('换报表主体与整份替换是 replace；没有操作时为 undefined', () => {
    expect(step([{ type: 'setBody', body: groupDocument.body }])).toEqual({ action: 'replace', kind: 'view', count: 1 })
    expect(step([{ type: 'replaceDocument', document: groupDocument }])).toEqual({ action: 'replace', kind: 'document', count: 1 })
    expect(step([])).toBeUndefined()
  })
})
