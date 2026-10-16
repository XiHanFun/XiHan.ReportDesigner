/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardCard, DashboardView, ReportCardType, ReportDocument, ReportQuery } from '../src'
import { describe, expect, it } from 'vitest'
import { applyOperations, cardTemplate, planFillBindings, validateDocument } from '../src'

const query: ReportQuery = {
  dimensions: [{ id: 'region', field: 'region' }, { id: 'channel', field: 'channel' }],
  measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }, { id: 'n', aggregate: 'count' }, { id: 'avg', aggregate: 'avg', field: 'amount' }],
}

function documentWith(card: DashboardCard): ReportDocument {
  return {
    schemaVersion: 1,
    id: 'board',
    datasets: [{ id: 'sales', fields: [{ name: 'region', type: 'string' }, { name: 'channel', type: 'string' }, { name: 'amount', type: 'number' }] }],
    body: { type: 'dashboard', grid: { columns: 12, rowHeight: 40 }, cards: [card] },
  }
}

/** 由模板建一张卡片、换上查询后补全绑定，返回补全之后的卡片。 */
function filled(type: ReportCardType, override: Partial<DashboardCard> = {}): DashboardCard {
  const template = cardTemplate(type, 'sales')
  const card = { ...template, id: 'c', layout: { x: 0, y: 0, ...template.layout }, ...('query' in template ? { query } : {}), ...override } as DashboardCard
  const document = documentWith(card)
  return (applyOperations(document, planFillBindings(document, 'c')).document.body as DashboardView).cards[0]!
}

describe('planFillBindings', () => {
  it('饼图、漏斗图、指标卡片的必填引用取第一个维度与度量', () => {
    expect(filled('chart.pie')).toMatchObject({ chart: { nameField: 'region', valueField: 'amount' } })
    expect(filled('chart.funnel')).toMatchObject({ chart: { nameField: 'region', valueField: 'amount' } })
    expect(filled('metric')).toMatchObject({ metric: { value: 'amount' } })
  })

  it('同类的几处引用取不同的项：桑基图的源与目标、矩阵热力图的行与列', () => {
    expect(filled('chart.sankey')).toMatchObject({ chart: { sourceField: 'region', targetField: 'channel', valueField: 'amount' } })
    expect(filled('chart.heatmap')).toMatchObject({ chart: { rowField: 'region', columnField: 'channel', valueField: 'amount' } })
  })

  it('雷达图指标取全部度量，层级图的层取全部维度，柱线图为每个度量建一条柱系列', () => {
    expect(filled('chart.radar')).toMatchObject({ chart: { nameField: 'region', indicators: [{ key: 'amount' }, { key: 'n' }, { key: 'avg' }] } })
    expect(filled('chart.hierarchy')).toMatchObject({ chart: { levels: ['region', 'channel'], valueField: 'amount' } })
    expect(filled('chart.cartesian')).toMatchObject({ chart: { series: [
      { id: 'amount', mark: 'bar', x: 'region', y: 'amount' },
      { id: 'n', mark: 'bar', x: 'region', y: 'n' },
      { id: 'avg', mark: 'bar', x: 'region', y: 'avg' },
    ] } })
    for (const type of ['chart.pie', 'chart.radar', 'chart.sankey', 'chart.heatmap', 'chart.hierarchy', 'chart.cartesian', 'metric'] as const)
      expect(validateDocument(documentWith(filled(type))), type).toEqual([])
  })

  it('指着已删掉的项的引用重新取，有效的引用不动；已有系列只换掉无效的横轴', () => {
    expect(filled('chart.pie', { chart: { type: 'pie', nameField: 'channel', valueField: 'gone' } } as Partial<DashboardCard>)).toMatchObject({ chart: { nameField: 'channel', valueField: 'amount' } })
    const cartesian = filled('chart.cartesian', { chart: { type: 'cartesian', series: [{ id: 's', mark: 'line', x: 'gone', y: 'n' }] } } as Partial<DashboardCard>)
    expect(cartesian).toMatchObject({ chart: { series: [{ id: 's', mark: 'line', x: 'region', y: 'n' }] } })
  })

  it('没有可用的项、没有要补的或是表格卡片时为空数组', () => {
    const template = cardTemplate('chart.pie', 'sales')
    const empty = documentWith({ ...template, id: 'c', layout: { x: 0, y: 0, ...template.layout } } as DashboardCard)
    expect(planFillBindings(empty, 'c')).toEqual([])
    const done = documentWith(filled('chart.pie'))
    expect(planFillBindings(done, 'c')).toEqual([])
    const table = cardTemplate('table.table', 'sales')
    expect(planFillBindings(documentWith({ ...table, id: 'c', layout: { x: 0, y: 0, ...table.layout } } as DashboardCard), 'c')).toEqual([])
    expect(() => planFillBindings(done, 'ghost')).toThrow(RangeError)
  })
})
