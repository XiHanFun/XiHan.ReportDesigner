/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { ChartCard, CrosstabView, DatasetSchema, GroupView, ReportParameter, TableView } from '../src'
import { describe, expect, it } from 'vitest'
import { createDatasetRequest, resolveParameters } from '../src'
import { salesDataset } from './fixtures'

describe('resolveParameters', () => {
  const parameters: ReportParameter[] = [
    { name: 'region', type: 'string', multiple: true, defaultValue: ['East'] },
    { name: 'from', type: 'date', required: true },
    { name: 'at', type: 'datetime' },
    { name: 'top', type: 'number', defaultValue: 10, options: [{ value: 5 }, { value: 10 }] },
    { name: 'flag', type: 'boolean' },
  ]

  it('没给的取缺省值，写 null 表示不给值，多选参数总是数组', () => {
    expect(resolveParameters(parameters, { from: '2026-01-01', region: 'West', flag: false })).toEqual({
      values: { region: ['West'], from: '2026-01-01', top: 10, flag: false },
      issues: [],
    })
    expect(resolveParameters(parameters, { from: '2026-01-01', region: null, top: null }).values).toEqual({ from: '2026-01-01' })
  })

  it('报出必填、类型、单选、候选项与未声明的参数', () => {
    const { values, issues } = resolveParameters(parameters, {
      region: ['East', 1],
      at: '2026-10-16 08:00',
      top: 7,
      flag: [true],
      other: 'x',
    })
    expect(values).toEqual({ at: '2026-10-16 08:00' })
    expect(issues).toEqual([
      { code: 'parameter-type-mismatch', path: ['parameters', 'region'], params: { expected: 'string' } },
      { code: 'parameter-required', path: ['parameters', 'from'] },
      { code: 'parameter-option-mismatch', path: ['parameters', 'top'] },
      { code: 'parameter-not-multiple', path: ['parameters', 'flag'] },
      { code: 'unknown-parameter', path: ['parameters', 'other'] },
    ])
  })

  it('日期参数须是合法的 ISO 日期', () => {
    expect(resolveParameters(parameters, { from: '2026-02-30' }).issues[0]?.code).toBe('parameter-type-mismatch')
    expect(resolveParameters(parameters, { from: '2026-02-28T00:00' }).issues[0]?.code).toBe('parameter-type-mismatch')
    expect(resolveParameters(parameters, { from: '2026-02-28', at: 'soon' }).issues[0]?.code).toBe('parameter-type-mismatch')
  })
})

describe('createDatasetRequest', () => {
  const table: TableView = {
    type: 'table',
    dataset: 'sales',
    parameters: { year: { parameter: 'year' }, fixed: 'yes', none: { parameter: 'missing' } },
    columns: [{ id: 'amount', field: 'amount' }],
    filter: {
      logic: 'or',
      conditions: [
        { id: 'r', field: 'region', operator: 'in', value: { parameter: 'regions' } },
        { id: 'p', field: 'product', operator: 'eq', value: { parameter: 'missing' } },
        { id: 'e', field: 'qty', operator: 'isEmpty' },
      ],
    },
    sort: [{ field: 'amount', direction: 'desc' }],
    limit: 20,
  }

  it('明细表：解析参数绑定、代入筛选，带排序与上限，没有聚合', () => {
    const request = createDatasetRequest(table, salesDataset, { parameters: { year: 2026, regions: ['East'] } })
    expect(request).toEqual({
      dataset: 'sales',
      parameters: { year: 2026, fixed: 'yes' },
      filter: {
        logic: 'or',
        conditions: [
          { id: 'r', field: 'region', operator: 'in', value: ['East'] },
          { id: 'e', field: 'qty', operator: 'isEmpty' },
        ],
      },
      sort: [{ field: 'amount', direction: 'desc' }],
      limit: 20,
      query: null,
    })
  })

  it('追加条件与 or 组合的视图筛选同时满足', () => {
    const request = createDatasetRequest(table, salesDataset, {
      parameters: { regions: ['East'] },
      filters: [{ id: 'link:a', field: 'product', operator: 'in', value: ['A'] }],
    })
    expect(request.filter).toEqual({
      logic: 'and',
      conditions: [
        { id: '$view', logic: 'or', conditions: [
          { id: 'r', field: 'region', operator: 'in', value: ['East'] },
          { id: 'e', field: 'qty', operator: 'isEmpty' },
        ] },
        { id: 'link:a', field: 'product', operator: 'in', value: ['A'] },
      ],
    })
  })

  it('全部条件都为空时 filter 为 null', () => {
    const request = createDatasetRequest({ ...table, filter: { logic: 'and', conditions: [{ id: 'p', field: 'product', operator: 'eq', value: null }] } }, salesDataset)
    expect(request.filter).toBeNull()
  })

  it('图表卡片：聚合查询，有不可累加度量时要总计的汇总值', () => {
    const card: ChartCard = {
      id: 'c',
      kind: 'chart',
      layout: { x: 0, y: 0, w: 6, h: 4 },
      dataset: 'sales',
      query: {
        dimensions: [{ id: 'month', field: 'date', bucket: 'month' }],
        measures: [
          { id: 'amount', aggregate: 'sum', field: 'amount' },
          { id: 'buyers', aggregate: 'distinctCount', field: 'region' },
          { id: 'ratio', formula: 'amount / buyers' },
        ],
      },
      chart: { type: 'cartesian', series: [{ id: 's', mark: 'bar', x: 'month', y: 'amount' }] },
    }
    expect(createDatasetRequest(card, salesDataset)).toEqual({
      dataset: 'sales',
      parameters: {},
      filter: null,
      sort: null,
      limit: null,
      query: {
        dimensions: [{ id: 'month', field: 'date', bucket: 'month' }],
        measures: [
          { id: 'amount', field: 'amount', aggregate: 'sum' },
          { id: 'buyers', field: 'region', aggregate: 'distinctCount' },
        ],
        rollups: [[]],
      },
    })
  })

  it('交叉表要除最细粒度外的全部汇总分组；只有可累加度量时不要', () => {
    const crosstab: CrosstabView = {
      type: 'crosstab',
      dataset: 'sales',
      rows: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }],
      columns: [{ id: 'month', field: 'date', bucket: 'month' }],
      measures: [{ id: 'avg', aggregate: 'avg', field: 'amount' }],
    }
    expect(createDatasetRequest(crosstab, salesDataset).query?.rollups).toEqual([
      [],
      ['month'],
      ['region'],
      ['region', 'month'],
      ['region', 'product'],
    ])
    const additive = { ...crosstab, measures: [{ id: 'sum', aggregate: 'sum' as const, field: 'amount' }] }
    expect(createDatasetRequest(additive, salesDataset).query?.rollups).toEqual([])
  })

  it('分组报表：列明细时是明细请求，只出汇总时是聚合请求', () => {
    const group: GroupView = {
      type: 'group',
      dataset: 'sales',
      groups: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }],
      columns: [{ id: 'avg', field: 'amount', summary: { aggregate: 'avg' } }, { id: 'p', field: 'product' }],
      sort: [{ field: 'amount' }],
    }
    const detail = createDatasetRequest(group, salesDataset)
    expect(detail.query).toBeNull()
    expect(detail.sort).toEqual([{ field: 'amount' }])
    const summary = createDatasetRequest({ ...group, detail: false, grandTotal: false }, salesDataset)
    expect(summary.sort).toBeNull()
    expect(summary.query).toEqual({
      dimensions: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }],
      measures: [{ id: 'avg', field: 'amount', aggregate: 'avg' }],
      rollups: [['region']],
    })
  })

  it('引用计算字段时不下推：维度或度量引用时 query 为 null，筛选引用时 filter 也为 null', () => {
    const dataset: DatasetSchema = { ...salesDataset, fields: [...salesDataset.fields, { name: 'big', type: 'boolean', formula: 'amount > 50' }] }
    const crosstab: CrosstabView = {
      type: 'crosstab',
      dataset: 'sales',
      rows: [{ id: 'big', field: 'big' }],
      columns: [],
      measures: [{ id: 'n', aggregate: 'count' }],
      filter: { logic: 'and', conditions: [{ id: 'r', field: 'region', operator: 'eq', value: 'East' }] },
    }
    const byDimension = createDatasetRequest(crosstab, dataset)
    expect(byDimension.query).toBeNull()
    expect(byDimension.filter).not.toBeNull()
    const byFilter = createDatasetRequest({
      ...crosstab,
      rows: [{ id: 'region', field: 'region' }],
      filter: { logic: 'and', conditions: [{ id: 'b', field: 'big', operator: 'eq', value: true }] },
    }, dataset)
    expect(byFilter.query).toBeNull()
    expect(byFilter.filter).toBeNull()
  })
})
