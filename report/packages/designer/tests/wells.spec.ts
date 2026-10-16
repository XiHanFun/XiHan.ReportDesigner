/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardCard, ReportDocument } from '@xihan-report/core'
import { cardTemplate, planAddFieldItem } from '@xihan-report/core'
import { describe, expect, it } from 'vitest'
import { fieldList, wellsOwner, withFilledBindings } from '../src/wells'

const template = cardTemplate('chart.pie', 'sales')
const pie = { ...template, id: 'pie', layout: { x: 0, y: 0, ...template.layout } } as DashboardCard

const board: ReportDocument = {
  schemaVersion: 1,
  id: 'board',
  datasets: [{ id: 'sales', fields: [{ name: 'region', type: 'string' }, { name: 'amount', type: 'number' }] }],
  body: { type: 'dashboard', grid: { columns: 12, rowHeight: 40 }, cards: [pie] },
}

describe('字段栏的辅助函数', () => {
  it('编辑对象：看板上只认唯一选中的卡片，主体不是看板时是主体的视图', () => {
    expect(wellsOwner(board, { cards: [] })).toBeUndefined()
    expect(wellsOwner(board, { cards: ['pie'] })).toMatchObject({ card: 'pie', dataset: 'sales' })
    const crosstab: ReportDocument = { ...board, body: { type: 'crosstab', dataset: 'sales', rows: [], columns: [], measures: [] } }
    expect(wellsOwner(crosstab, { cards: [] })).toMatchObject({ dataset: 'sales', source: { type: 'crosstab' } })
  })

  it('字段直接拖到对象上时进的列表：数值进度量，其余进维度或交叉表的行，明细表与分组报表进列', () => {
    const owner = wellsOwner(board, { cards: ['pie'] })!
    expect([fieldList(owner.source, 'number'), fieldList(owner.source, 'date')]).toEqual(['measures', 'dimensions'])
    expect([fieldList({ type: 'crosstab', dataset: 'sales', rows: [], columns: [], measures: [] }, 'number'), fieldList({ type: 'crosstab', dataset: 'sales', rows: [], columns: [], measures: [] }, 'string')]).toEqual(['measures', 'rows'])
    expect(fieldList({ type: 'table', dataset: 'sales', columns: [] }, 'number')).toBe('columns')
  })

  it('加项之后补全卡片的必填绑定，合为一组操作；主体的视图不补', () => {
    const operations = withFilledBindings(board, { card: 'pie' }, planAddFieldItem(board, { card: 'pie' }, 'dimensions', 'region'))
    expect(operations.map(operation => operation.type)).toEqual(['addItem', 'updateCard'])
    expect(operations[1]).toMatchObject({ changes: [{ path: ['chart', 'nameField'], value: 'region' }] })
    const table: ReportDocument = { ...board, body: { type: 'table', dataset: 'sales', columns: [] } }
    expect(withFilledBindings(table, {}, planAddFieldItem(table, {}, 'columns', 'region')).map(operation => operation.type)).toEqual(['addItem'])
  })
})
