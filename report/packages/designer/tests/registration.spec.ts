// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { ReportCardType, ReportDocument } from '@xihan-report/core'
import type { XhReportDesigner } from '../src'
import { cardTemplate, planAddFieldItem, planFillBindings, REPORT_CARD_TYPES } from '@xihan-report/core'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineReportDesigner } from '../src'

// 这一份只调 defineReportDesigner()，不调 defineXhElements()：设计器用到的库内元素都得由它自己注册

const report: ReportDocument = {
  schemaVersion: 1,
  id: 'all-cards',
  datasets: [{
    id: 'sales',
    fields: [
      { name: 'region', type: 'string' },
      { name: 'product', type: 'string' },
      { name: 'date', type: 'date' },
      { name: 'amount', type: 'number' },
      { name: 'qty', type: 'number' },
    ],
  }],
  parameters: [
    { name: 'channel', type: 'string', options: [{ value: 'web' }, { value: 'shop' }] },
    { name: 'paid', type: 'boolean' },
    { name: 'from', type: 'date' },
    { name: 'limit', type: 'number' },
    { name: 'keyword', type: 'string' },
    { name: 'tags', type: 'string', multiple: true },
  ],
  body: { type: 'dashboard', grid: { columns: 12, rowHeight: 40 }, cards: [] },
}

const rows = [
  { region: 'East', product: 'A', date: '2026-01-02', amount: 10, qty: 1 },
  { region: 'West', product: 'B', date: '2026-02-03', amount: 5, qty: 2 },
]

// jsdom 不排版：属性面板里多行文本框自动增高要读的计算样式给出浏览器里的缺省值
const STYLE_FALLBACK: Readonly<Record<string, string>> = {
  'writing-mode': 'horizontal-tb',
  'box-sizing': 'border-box',
  'max-block-size': 'none',
  'padding-top': '0px',
  'padding-bottom': '0px',
  'border-top-width': '0px',
  'border-bottom-width': '0px',
  'font-size': '14px',
  'line-height': '20px',
}

beforeAll(() => {
  defineReportDesigner()
  Element.prototype.scrollIntoView ??= function () {}
})

beforeEach(() => {
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => new Proxy(real(element, pseudo), {
    get(target, key) {
      if (key === 'getPropertyValue')
        return (name: string) => target.getPropertyValue(name) || STYLE_FALLBACK[name] || ''
      const value = Reflect.get(target, key) as unknown
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  }))
  vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(20)
})

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

/** 往各类卡片里放的字段：两个维度、两个度量，交叉表放行、列与度量。 */
const FIELDS = {
  query: [['dimensions', 'region'], ['dimensions', 'product'], ['measures', 'amount'], ['measures', 'qty']],
  table: [['columns', 'region'], ['columns', 'amount']],
  group: [['groups', 'region'], ['columns', 'product'], ['columns', 'amount']],
  crosstab: [['rows', 'region'], ['columns', 'product'], ['measures', 'amount']],
} as const

function cardKind(type: ReportCardType): keyof typeof FIELDS {
  return type === 'table.table' ? 'table' : type === 'table.group' ? 'group' : type === 'table.crosstab' ? 'crosstab' : 'query'
}

/** 文档里出现过的 xh-* 元素，与其中没有升级的那些。 */
function scan(seen: Set<string>): string[] {
  const missing = new Set<string>()
  for (const element of document.querySelectorAll('*')) {
    const tag = element.localName
    if (!tag.startsWith('xh-'))
      continue
    seen.add(tag)
    const ctor = customElements.get(tag)
    if (!ctor || !(element instanceof ctor))
      missing.add(tag)
  }
  return [...missing].sort()
}

async function settle(designer: XhReportDesigner): Promise<void> {
  await designer.updateComplete
  await new Promise(resolve => setTimeout(resolve, 0))
  await designer.updateComplete
}

/** 走遍各类卡片与面板的一整轮，耗时随机器负载变化，给足时间预算。 */
describe('defineReportDesigner()', () => {
  it('只调它、不调 defineXhElements()：看板各类卡片、属性面板、字段栏、数据面板、参数编辑器、预览与确认框里的 xh-* 元素都已升级', async () => {
    const designer = document.createElement('xh-report-designer')
    designer.dataProvider = async () => ({ kind: 'rows', rows })
    designer.datasetEditing = 'full'
    designer.schema = report
    document.body.append(designer)
    await settle(designer)
    const cards = REPORT_CARD_TYPES.map((type) => {
      const card = designer.addCard(cardTemplate(type, 'sales'))
      for (const [list, field] of FIELDS[cardKind(type)])
        designer.execute(planAddFieldItem(designer.schema!, { card: card.id }, list, field))
      designer.execute(planFillBindings(designer.schema!, card.id))
      return card.id
    })
    await designer.refresh()
    await settle(designer)
    const seen = new Set<string>()
    expect(scan(seen)).toEqual([])

    for (const card of cards) {
      designer.select({ cards: [card] })
      await settle(designer)
      expect(scan(seen), `选中 ${card}`).toEqual([])
    }
    designer.select({ data: { kind: 'field', dataset: 'sales', name: 'region' } })
    await settle(designer)
    expect(scan(seen)).toEqual([])
    for (const parameter of report.parameters!) {
      designer.select({ data: { kind: 'parameter', name: parameter.name } })
      await settle(designer)
      expect(scan(seen), `参数 ${parameter.name}`).toEqual([])
    }
    // 删一个被卡片用着的字段：先弹确认框
    const used = designer.schema!.body.type === 'dashboard' ? designer.schema!.body.cards.flatMap(item => (item.kind === 'chart' || item.kind === 'metric' ? item.query.dimensions.map(dimension => dimension.field) : []))[0]! : ''
    designer.select({ data: { kind: 'field', dataset: 'sales', name: used } })
    designer.deleteSelection()
    await settle(designer)
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(scan(seen)).toEqual([])

    designer.mode = 'preview'
    await settle(designer)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(scan(seen)).toEqual([])

    // 确认这一遍真走到了各类元素，不是空跑
    for (const tag of [
      'xh-report-designer',
      'xh-report-viewer',
      'xh-designer-frame',
      'xh-designer-properties',
      'xh-designer-palette',
      'xh-designer-issues',
      'xh-designer-transform',
      'xh-splitter',
      'xh-accordion',
      'xh-field',
      'xh-toolbar',
      'xh-context-menu',
      'xh-tree',
      'xh-sortable',
      'xh-tag',
      'xh-button',
      'xh-toggle-group',
      'xh-table',
      'xh-statistic',
      'xh-cartesian-chart',
      'xh-pie-chart',
      'xh-funnel-chart',
      'xh-radar-chart',
      'xh-sankey-chart',
      'xh-heatmap',
      'xh-hierarchy-chart',
      'xh-select',
      'xh-switch',
      'xh-date-field',
      'xh-number-field',
      'xh-text-field',
      'xh-tags-input',
      'xh-dialog',
    ])
      expect(seen, tag).toContain(tag)
  }, 30_000)
})
