/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { ReportDocument, ReportOperation } from '../src'
import { describe, expect, it } from 'vitest'
import { applyOperations, planAddFieldItem, planRemoveItem, planRenameField, planRenameItem, readPath, validateDocument } from '../src'
import { dashboardDocument, groupDocument } from './documents'

/** 应用计划，校验结果，再用逆操作还原；返回应用后的文档。 */
function apply(operations: readonly ReportOperation[], from: ReportDocument = dashboardDocument): ReportDocument {
  const { document, inverse } = applyOperations(from, operations)
  expect(applyOperations(document, inverse).document).toEqual(from)
  return document
}

const card = (id: string): (string | number)[] => ['body', 'cards', id]

describe('planRenameItem', () => {
  it('度量改 id：图表系列、查询排序与维度排序里的引用一起改', () => {
    const document = apply(planRenameItem(dashboardDocument, { card: 'trend' }, 'measures', 'amount', 'revenue'))
    expect(readPath(document, [...card('trend'), 'chart', 'series', 'bars', 'y'])).toBe('revenue')
    expect(validateDocument(document)).toEqual([])
    const share = apply(planRenameItem(dashboardDocument, { card: 'share' }, 'measures', 'amount', 'total'))
    expect(readPath(share, [...card('share'), 'chart', 'valueField'])).toBe('total')
    expect(readPath(share, [...card('share'), 'query', 'dimensions', 'product', 'sort', 'by'])).toBe('total')
    expect(validateDocument(share)).toEqual([])
  })

  it('维度改 id：系列的 x、splitBy、查询排序与以它为源的联动一起改', () => {
    const document = apply(planRenameItem(dashboardDocument, { card: 'trend' }, 'dimensions', 'month', 'period'))
    expect(readPath(document, [...card('trend'), 'chart', 'series', 'line', 'x'])).toBe('period')
    expect(readPath(document, [...card('trend'), 'query', 'sort', 0, 'key'])).toBe('period')
    expect(readPath(document, ['body', 'links', 'byMonth', 'dimension'])).toBe('period')
    expect(validateDocument(document)).toEqual([])
  })

  it('交叉表维度、分组报表的列与直角坐标系列改 id', () => {
    const pivot = apply(planRenameItem(dashboardDocument, { card: 'pivot' }, 'rows', 'region', 'area'))
    expect(readPath(pivot, ['body', 'links', 'byRegion', 'dimension'])).toBe('area')
    expect(validateDocument(pivot)).toEqual([])
    const grouped = apply(planRenameItem(groupDocument, {}, 'columns', 'amount', 'sales'), groupDocument)
    expect(readPath(grouped, ['body', 'groups', 'region', 'sort', 'by'])).toBe('sales')
    expect(validateDocument(grouped)).toEqual([])
    const series = apply(planRenameItem(dashboardDocument, { card: 'trend' }, 'series', 'bars', 'columns'))
    expect(readPath(series, [...card('trend'), 'chart', 'annotations', 1, 'series'])).toBe('columns')
    expect(validateDocument(series)).toEqual([])
    expect(planRenameItem(dashboardDocument, { card: 'trend' }, 'series', 'bars', 'bars')).toEqual([])
  })
})

describe('planRemoveItem', () => {
  it('删度量：引用它的系列连同指向该系列的标注一起删', () => {
    const document = apply(planRemoveItem(dashboardDocument, { card: 'trend' }, 'measures', 'unit'))
    expect((readPath(document, [...card('trend'), 'chart', 'series']) as { id: string }[]).map(item => item.id)).toEqual(['bars'])
    expect((readPath(document, [...card('trend'), 'chart', 'annotations']) as unknown[])).toHaveLength(2)
    expect(validateDocument(document)).toEqual([])
  })

  it('删维度：可选的 splitBy 删掉属性；以它为源的联动删除', () => {
    const trend = apply(planRemoveItem(dashboardDocument, { card: 'trend' }, 'dimensions', 'region'))
    expect(readPath(trend, [...card('trend'), 'chart'])).not.toHaveProperty('splitBy')
    expect(validateDocument(trend)).toEqual([])
    const pivot = apply(planRemoveItem(dashboardDocument, { card: 'pivot' }, 'rows', 'region'))
    expect(readPath(pivot, ['body', 'links', 'byRegion'])).toBeUndefined()
    expect(validateDocument(pivot)).toEqual([])
  })

  it('指标卡片：删基准值去掉 baseline，删迷你图用到的维度去掉迷你图', () => {
    const kpi = readPath(dashboardDocument, [...card('kpi'), 'metric']) as { baseline?: string, sparkline?: { x: string } }
    expect(kpi.baseline).toBe('target')
    const baseline = apply(planRemoveItem(dashboardDocument, { card: 'kpi' }, 'measures', 'target'))
    expect(readPath(baseline, [...card('kpi'), 'metric'])).not.toHaveProperty('baseline')
    const sparkline = apply(planRemoveItem(dashboardDocument, { card: 'kpi' }, 'dimensions', kpi.sparkline!.x))
    expect(readPath(sparkline, [...card('kpi'), 'metric'])).not.toHaveProperty('sparkline')
    expect(validateDocument(sparkline)).toEqual([])
  })

  it('图表必填的引用照留，由校验报出；分组列被删时去掉分组的 sort.by', () => {
    const share = apply(planRemoveItem(dashboardDocument, { card: 'share' }, 'measures', 'amount'))
    expect(validateDocument(share).map(issue => issue.code)).toContain('unknown-measure')
    const grouped = apply(planRemoveItem(groupDocument, {}, 'columns', 'amount'), groupDocument)
    expect(readPath(grouped, ['body', 'groups', 'region', 'sort'])).toEqual({ direction: 'desc' })
  })

  it('所在对象不存在时抛 RangeError', () => {
    expect(() => planRemoveItem(dashboardDocument, { card: 'ghost' }, 'measures', 'x')).toThrow(RangeError)
    expect(() => planRemoveItem(dashboardDocument, {}, 'measures', 'x')).toThrow(RangeError)
  })
})

describe('planRenameField', () => {
  it('字段改名：各视图与查询的 field、筛选条件、明细排序与联动目标一起改', () => {
    const document = apply(planRenameField(dashboardDocument, 'sales', 'date', 'day'))
    expect(readPath(document, ['datasets', 'sales', 'fields', 'day', 'type'])).toBe('date')
    expect(readPath(document, [...card('trend'), 'query', 'dimensions', 'month', 'field'])).toBe('day')
    expect(readPath(document, [...card('trend'), 'query', 'filter', 'conditions', 'g', 'conditions', 'd', 'field'])).toBe('day')
    expect(readPath(document, [...card('detail'), 'view', 'sort', 0, 'field'])).toBe('day')
    expect(readPath(document, ['body', 'links', 'byMonth', 'targets', 0, 'field'])).toBe('day')
    expect(validateDocument(document)).toEqual([])
    const grouped = apply(planRenameField(groupDocument, 'sales', 'amount', 'revenue'), groupDocument)
    expect(readPath(grouped, ['body', 'sort', 0, 'field'])).toBe('revenue')
    expect(validateDocument(grouped)).toEqual([])
    expect(() => planRenameField(dashboardDocument, 'sales', 'ghost', 'x')).toThrow(RangeError)
  })
})

describe('planAddFieldItem', () => {
  it('按字段类型给缺省：日期维度按月，数值度量 sum，其余度量 count；id 被占用时接着编', () => {
    const [dimension] = planAddFieldItem(dashboardDocument, { card: 'kpi' }, 'dimensions', 'date')
    expect(dimension).toMatchObject({ type: 'addItem', card: 'kpi', list: 'dimensions', item: { id: 'date', field: 'date', bucket: 'month' } })
    const [sum] = planAddFieldItem(dashboardDocument, { card: 'share' }, 'measures', 'amount')
    expect(sum).toMatchObject({ item: { id: 'amount1', field: 'amount', aggregate: 'sum' } })
    const [count] = planAddFieldItem(dashboardDocument, { card: 'share' }, 'measures', 'region')
    expect(count).toMatchObject({ item: { id: 'region', field: 'region', aggregate: 'count' } })
    const [column] = planAddFieldItem(dashboardDocument, { card: 'detail' }, 'columns', 'date', { index: 0 })
    expect(column).toMatchObject({ index: 0, item: { id: 'date', field: 'date' } })
    expect((column as { item: object }).item).not.toHaveProperty('bucket')
    const document = apply([dimension!, sum!, column!, ...planAddFieldItem(dashboardDocument, { card: 'pivot' }, 'columns', 'product')])
    expect(validateDocument(document)).toEqual([])
  })

  it('字段不存在或列表是 series 时抛 RangeError', () => {
    expect(() => planAddFieldItem(dashboardDocument, { card: 'kpi' }, 'dimensions', 'ghost')).toThrow(RangeError)
    expect(() => planAddFieldItem(dashboardDocument, { card: 'trend' }, 'series', 'amount')).toThrow(RangeError)
  })
})
