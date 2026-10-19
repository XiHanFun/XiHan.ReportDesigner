/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { JsonValue } from '@xihan-ui/core/json'
import type { CartesianChartSpec, DashboardView, ReportDocument, ReportPropertyDescriptor } from '../src'
import { checkProperties, groupProperties, isPropertyVisible } from '@xihan-ui/designer-kit/properties'
import { describe, expect, it } from 'vitest'
import {
  cardProperties,
  chartProperties,
  createReportModel,
  dashboardProperties,
  datasetFieldProperties,
  dimensionProperties,
  documentProperties,
  groupLevelProperties,
  linkProperties,
  measureProperties,
  metricProperties,
  parameterProperties,
  PIE_VARIANTS,
  REPORT_PROPERTY_GROUPS,
  seriesProperties,
  tableColumnProperties,
  viewProperties,
} from '../src'
import { dashboardDocument, groupDocument } from './documents'

function issues(descriptors: readonly ReportPropertyDescriptor[], target: unknown): unknown[] {
  return checkProperties(descriptors, target as JsonValue, { controls: createReportModel().controls })
}

function visible(descriptors: readonly ReportPropertyDescriptor[], target: unknown): string[] {
  return descriptors.filter(descriptor => isPropertyVisible(descriptor, target as JsonValue)).map(descriptor => descriptor.path.join('.'))
}

const dashboard = dashboardDocument.body as DashboardView

describe('属性描述', () => {
  it('报表参数的固定候选项用内建的选项表，取值的类型跟着参数的类型；查得出重复与类型不对的取值', () => {
    const controls = (type: string): unknown[] => parameterProperties()
      .filter(descriptor => descriptor.path[0] === 'options' && isPropertyVisible(descriptor, { name: 'p', type }))
      .map(descriptor => descriptor.control)
    expect(['string', 'number', 'boolean', 'date', 'datetime'].map(controls)).toEqual([
      [{ kind: 'options', valueType: 'string' }],
      [{ kind: 'options', valueType: 'number' }],
      [{ kind: 'options', valueType: 'boolean' }],
      [{ kind: 'options', valueType: 'date' }],
      [{ kind: 'options', valueType: 'datetime' }],
    ])
    const codes = (parameter: Record<string, unknown>): unknown[] => issues(parameterProperties(), { name: 'p', ...parameter })
    expect(codes({ type: 'string', options: [{ value: 'East' }, { value: 'East', label: '东' }] }))
      .toEqual([expect.objectContaining({ code: 'duplicate-value', path: ['options', 1, 'value'] })])
    expect(codes({ type: 'number', options: [{ value: 2025 }, { value: 2026, disabled: true }] })).toEqual([])
    expect(codes({ type: 'number', options: [{ value: 2025 }, { value: '2026' }] }))
      .toEqual([expect.objectContaining({ code: 'invalid-type', path: ['options', 1, 'value'] })])
    expect(codes({ type: 'number', options: [{ value: 2025 }, { value: 2025, label: '今年' }] }))
      .toEqual([expect.objectContaining({ code: 'duplicate-value', path: ['options', 1, 'value'] })])
    expect(codes({ type: 'boolean', options: [{ value: true, label: '是' }, { value: false, label: '否' }] })).toEqual([])
    expect(codes({ type: 'date', options: [{ value: '2026-10-19' }, { value: '2026-10-20' }] })).toEqual([])
    expect(codes({ type: 'datetime', options: [{ value: '2026-10-19T08:30' }, { value: '2026-10-19T17:00' }] })).toEqual([])
  })

  it('合法的示例文档逐个对象检查都没有问题', () => {
    const check = (document: ReportDocument): void => {
      expect(issues(documentProperties(), document)).toEqual([])
      for (const dataset of document.datasets) {
        for (const field of dataset.fields)
          expect(issues(datasetFieldProperties(), field)).toEqual([])
      }
      for (const parameter of document.parameters ?? [])
        expect(issues(parameterProperties(), parameter)).toEqual([])
    }
    check(dashboardDocument)
    check(groupDocument)
    expect(issues(dashboardProperties(), dashboard)).toEqual([])
    for (const link of dashboard.links ?? [])
      expect(issues(linkProperties(), link)).toEqual([])
    for (const card of dashboard.cards) {
      expect(issues(cardProperties(card), card)).toEqual([])
      if (card.kind === 'chart') {
        expect(issues(chartProperties(card.chart.type), card.chart)).toEqual([])
        for (const series of (card.chart as CartesianChartSpec).series ?? [])
          expect(issues(seriesProperties(), series)).toEqual([])
      }
      if (card.kind === 'metric')
        expect(issues(metricProperties(), card.metric)).toEqual([])
      if (card.kind === 'chart' || card.kind === 'metric') {
        card.query.dimensions.forEach(dimension => expect(issues(dimensionProperties(), dimension)).toEqual([]))
        card.query.measures.forEach(measure => expect(issues(measureProperties(), measure)).toEqual([]))
      }
      else if (card.kind === 'table') {
        const view = card.view
        expect(issues(viewProperties(view.type), view)).toEqual([])
        if (view.type !== 'crosstab')
          view.columns.forEach(column => expect(issues(tableColumnProperties(), column)).toEqual([]))
        else
          [...view.rows, ...view.columns].forEach(dimension => expect(issues(dimensionProperties(), dimension)).toEqual([]))
      }
    }
    const body = groupDocument.body
    if (body.type === 'group') {
      expect(issues(viewProperties('group'), body)).toEqual([])
      body.groups.forEach(group => expect(issues(groupLevelProperties(), group)).toEqual([]))
    }
  })

  it('必填却未填时报 required，取值不在清单里时报 invalid-option', () => {
    expect(issues(chartProperties('pie'), { type: 'pie' })).toEqual([
      { code: 'required', path: ['nameField'] },
      { code: 'required', path: ['valueField'] },
    ])
    expect(issues(chartProperties('pie'), { type: 'pie', nameField: 'a', valueField: 'b', variant: 'ring' })).toEqual([{ code: 'invalid-option', path: ['variant'] }])
  })

  it('下拉选项取自 schema 的取值清单', () => {
    const variant = chartProperties('pie').find(descriptor => descriptor.path[0] === 'variant')!
    expect(variant.control).toEqual({ kind: 'select', options: PIE_VARIANTS.map(value => ({ value })) })
  })

  it('按条件显示：系列只显示所在标记的属性，热力图按形态，度量按聚合或公式，迷你图写了才显示', () => {
    const line = visible(seriesProperties(), { id: 's', mark: 'line', x: 'm', y: 'v' })
    expect(line).toContain('curve')
    expect(line).not.toContain('shape')
    expect(visible(seriesProperties(), { id: 's', mark: 'scatter', x: 'm', y: 'v' })).toContain('symbol')
    const matrix = visible(chartProperties('heatmap'), { type: 'heatmap', variant: 'matrix' })
    expect(matrix).toContain('rowField')
    expect(matrix).not.toContain('dateField')
    expect(visible(measureProperties(), { id: 'u', formula: 'a / b' })).toEqual(['title', 'formula', 'format'])
    expect(visible(measureProperties(), { id: 'n', aggregate: 'count' })).toEqual(['title', 'aggregate', 'field', 'format'])
    expect(visible(metricProperties(), { value: 'v' })).not.toContain('sparkline.x')
    expect(visible(tableColumnProperties(), { id: 'c', field: 'f', summary: { formula: 'x' } })).not.toContain('summary.aggregate')
  })

  it('分组按 REPORT_PROPERTY_GROUPS 的先后排列', () => {
    const groups = groupProperties(chartProperties('cartesian'), { type: 'cartesian', series: [] }, REPORT_PROPERTY_GROUPS)
    expect(groups.map(group => group.group)).toEqual(['data', 'display', 'axis', 'style', 'interaction'])
    expect(cardProperties({ kind: 'table' }).map(descriptor => descriptor.path.join('.'))).toEqual(['title', 'description'])
  })
})
