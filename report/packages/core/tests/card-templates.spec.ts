/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView, ReportCardType, ReportDocument } from '../src'
import { describe, expect, it } from 'vitest'
import { applyOperations, cardTemplate, cardTypeOf, planAddCard, REPORT_CARD_TYPES, validateDocument } from '../src'

const empty: ReportDocument = {
  schemaVersion: 1,
  id: 'board',
  datasets: [{ id: 'sales', fields: [{ name: 'region', type: 'string' }, { name: 'amount', type: 'number' }] }],
  body: { type: 'dashboard', grid: { columns: 12, rowHeight: 40 }, cards: [] },
}

function withCard(type: ReportCardType): ReportDocument {
  return applyOperations(empty, planAddCard(empty.body as DashboardView, { id: 'card1', ...cardTemplate(type, 'sales') })).document
}

describe('卡片种类与新卡片的模板', () => {
  it('列出全部卡片种类：图表、指标、表格依次排列', () => {
    expect(REPORT_CARD_TYPES).toEqual([
      'chart.cartesian',
      'chart.pie',
      'chart.funnel',
      'chart.radar',
      'chart.sankey',
      'chart.heatmap',
      'chart.hierarchy',
      'metric',
      'table.table',
      'table.group',
      'table.crosstab',
    ])
  })

  it('每种模板放进看板后还是同一种卡片，指标 3 × 3 格、其余 6 × 8 格', () => {
    for (const type of REPORT_CARD_TYPES) {
      const card = (withCard(type).body as DashboardView).cards[0]!
      expect(cardTypeOf(card)).toBe(type)
      expect([card.layout.w, card.layout.h]).toEqual(type === 'metric' ? [3, 3] : [6, 8])
    }
  })

  it('模板的结构合法，问题只出在留空的字段绑定上（雷达图另缺指标）', () => {
    const allowed = new Set(['required', 'empty', 'unknown-dimension', 'unknown-measure'])
    for (const type of REPORT_CARD_TYPES) {
      const others = validateDocument(withCard(type))
        .filter(issue => !allowed.has(issue.code) && !(issue.code === 'invalid-value' && issue.path.at(-1) === 'indicators'))
      expect(others, type).toEqual([])
    }
  })

  it('不认识的种类抛错', () => {
    expect(() => cardTemplate('chart.gauge' as ReportCardType, 'sales')).toThrow(RangeError)
  })
})
