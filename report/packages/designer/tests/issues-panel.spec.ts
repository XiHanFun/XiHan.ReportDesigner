/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView, ReportDocument } from '@xihan-report/core'
import { describe, expect, it } from 'vitest'
import { issueSelection } from '../src/issues-panel'

const board: ReportDocument = {
  schemaVersion: 1,
  id: 'board',
  datasets: [{ id: 'sales', fields: [{ name: 'region', type: 'string' }, { name: 'amount', type: 'number' }] }],
  parameters: [{ name: 'year', type: 'number' }],
  body: {
    type: 'dashboard',
    grid: { columns: 12, rowHeight: 40 },
    cards: [
      {
        id: 'trend',
        kind: 'chart',
        layout: { x: 0, y: 0, w: 6, h: 4 },
        dataset: 'sales',
        query: { dimensions: [{ id: 'region', field: 'region' }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] },
        chart: { type: 'cartesian', series: [{ id: 's', mark: 'bar', x: 'region', y: 'amount' }] },
      },
      { id: 't', kind: 'table', layout: { x: 6, y: 0, w: 6, h: 4 }, view: { type: 'table', dataset: 'sales', columns: [{ id: 'c', field: 'region' }] } },
    ],
  },
}

const at = (...path: (string | number)[]): ReturnType<typeof issueSelection> => issueSelection(board, { code: 'required', path })

describe('问题路径换成选择', () => {
  it('卡片、卡片查询与视图里的列表项、柱线图的系列', () => {
    expect(at('body', 'cards', 0, 'chart', 'type')).toEqual({ cards: ['trend'] })
    expect(at('body', 'cards', 0, 'query', 'measures', 0, 'field')).toEqual({ cards: ['trend'], item: { card: 'trend', list: 'measures', id: 'amount' } })
    expect(at('body', 'cards', 0, 'chart', 'series', 0, 'y')).toEqual({ cards: ['trend'], item: { card: 'trend', list: 'series', id: 's' } })
    expect(at('body', 'cards', 1, 'view', 'columns', 0, 'field')).toEqual({ cards: ['t'], item: { card: 't', list: 'columns', id: 'c' } })
  })

  it('看板联动：选中联动与它的源卡片', () => {
    const linked: ReportDocument = { ...board, body: { ...(board.body as DashboardView), links: [{ id: 'l', card: 'trend', dimension: 'region', targets: [] }] } }
    expect(issueSelection(linked, { code: 'required', path: ['body', 'links', 0, 'targets'] })).toEqual({ cards: ['trend'], link: 'l' })
  })

  it('数据集、字段与报表参数；文档本身与看板网格是空选择', () => {
    expect(at('datasets', 0, 'fields', 1, 'type')).toEqual({ cards: [], data: { kind: 'field', dataset: 'sales', name: 'amount' } })
    expect(at('datasets', 0, 'id')).toEqual({ cards: [], data: { kind: 'dataset', dataset: 'sales' } })
    expect(at('parameters', 0, 'type')).toEqual({ cards: [], data: { kind: 'parameter', name: 'year' } })
    expect(at('title')).toEqual({ cards: [] })
    expect(at('body', 'grid', 'columns')).toEqual({ cards: [] })
  })

  it('还没校验过的 JSON：路径上的对象缺了或形状不对时停在能找到的那一层，不抛错', () => {
    const select = (document: unknown, ...path: (string | number)[]): ReturnType<typeof issueSelection> => issueSelection(document, { code: 'required', path })
    expect(select({ datasets: [{ id: 'd' }] }, 'datasets', 0, 'fields')).toEqual({ cards: [], data: { kind: 'dataset', dataset: 'd' } })
    expect(select({ datasets: 'x' }, 'datasets', 0)).toEqual({ cards: [] })
    expect(select({ parameters: 'p' }, 'parameters', 0)).toEqual({ cards: [] })
    expect(select({}, 'body')).toEqual({ cards: [] })
    expect(select(null, 'body')).toEqual({ cards: [] })
    expect(select({ body: { type: 'dashboard', cards: [{ id: 'c', kind: 'table', view: 3 }] } }, 'body', 'cards', 0, 'view', 'columns', 0)).toEqual({ cards: ['c'] })
    expect(select({ body: { type: 'dashboard', cards: [7], links: [7] } }, 'body', 'cards', 0, 'title')).toEqual({ cards: [] })
    expect(select({ body: { type: 'dashboard', links: [{ id: 'l' }] } }, 'body', 'links', 0)).toEqual({ cards: [] })
  })

  it('主体不是看板时指向主体视图的列表项', () => {
    const table: ReportDocument = { ...board, body: { type: 'table', dataset: 'sales', columns: [{ id: 'c', field: 'region' }] } }
    expect(issueSelection(table, { code: 'unknown-field', path: ['body', 'columns', 0, 'field'] })).toEqual({ cards: [], item: { list: 'columns', id: 'c' } })
  })
})
