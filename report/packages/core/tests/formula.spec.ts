/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DatasetSchema } from '../src'
import { describe, expect, it } from 'vitest'
import { applyCalculatedFields, ReportComputeError, runQuery } from '../src'
import { formulas, lookupEngine, salesData, salesDataset, salesRows } from './fixtures'

const withCalculated: DatasetSchema = {
  ...salesDataset,
  fields: [
    ...salesDataset.fields,
    { name: 'plus', type: 'number', formula: 'double + 1' },
    { name: 'double', type: 'number', formula: 'amount * 2' },
  ],
}

function failure(run: () => unknown): { code: string, params: Readonly<Record<string, unknown>>, cause: unknown } | null {
  try {
    run()
  }
  catch (error) {
    if (error instanceof ReportComputeError)
      return { code: error.code, params: error.params, cause: error.cause }
    throw error
  }
  return null
}

describe('applyCalculatedFields', () => {
  it('按引用次序逐行求值，不改原行', () => {
    const engine = lookupEngine(formulas)
    const rows = applyCalculatedFields(salesRows, withCalculated, engine)
    expect(rows[0]).toMatchObject({ amount: 100, double: 200, plus: 201 })
    expect(rows[3]).toMatchObject({ amount: null, double: null, plus: null })
    expect(salesRows[0]).not.toHaveProperty('double')
    expect(engine.compiled).toEqual(['double + 1', 'amount * 2'])
  })

  it('没有计算字段时原样返回，不需要引擎', () => {
    expect(applyCalculatedFields(salesRows, salesDataset, undefined)).toBe(salesRows)
  })

  it('计算字段参与分组与聚合', () => {
    const result = runQuery({
      dimensions: [{ id: 'region', field: 'region' }],
      measures: [{ id: 'plus', aggregate: 'sum', field: 'plus' }],
    }, withCalculated, salesData, { formula: lookupEngine(formulas) })
    expect(result.rows[0]).toEqual({ region: 'East', plus: 363 })
  })

  it('缺少引擎、编译失败、循环引用与求值失败各有错误码', () => {
    expect(failure(() => applyCalculatedFields(salesRows, withCalculated, undefined))?.code).toBe('formula-engine-missing')

    const broken: DatasetSchema = { ...salesDataset, fields: [...salesDataset.fields, { name: 'x', type: 'number', formula: 'nonsense' }] }
    const compile = failure(() => applyCalculatedFields(salesRows, broken, lookupEngine(formulas)))
    expect(compile).toMatchObject({ code: 'formula-compile-failed', params: { field: 'x', expression: 'nonsense' } })
    expect(compile?.cause).toBeInstanceOf(SyntaxError)

    const cyclic: DatasetSchema = {
      ...salesDataset,
      fields: [...salesDataset.fields, { name: 'a', type: 'number', formula: 'b + 1' }, { name: 'b', type: 'number', formula: 'a + 1' }],
    }
    expect(failure(() => applyCalculatedFields(salesRows, cyclic, lookupEngine(formulas)))).toMatchObject({ code: 'formula-cycle', params: { names: ['a', 'b'] } })

    const throwing: DatasetSchema = { ...salesDataset, fields: [...salesDataset.fields, { name: 'z', type: 'number', formula: 'boom' }] }
    expect(failure(() => applyCalculatedFields(salesRows, throwing, lookupEngine(formulas)))).toMatchObject({
      code: 'formula-evaluation-failed',
      params: { dataset: 'sales', row: 0, name: 'z' },
    })
  })
})

describe('公式里的报表参数', () => {
  const engine = lookupEngine(formulas)
  const dataset: DatasetSchema = { ...salesDataset, fields: [...salesDataset.fields, { name: 'taxed', type: 'number', formula: '$rate * amount' }] }

  it('计算字段以 $名字 引用参数，参数不写进结果行', () => {
    const rows = applyCalculatedFields(salesRows, dataset, engine, { rate: 2 })
    expect(rows[0]).toEqual({ ...salesRows[0], taxed: 200 })
    expect(rows[0]).not.toHaveProperty('$rate')
    expect(applyCalculatedFields(salesRows, dataset, engine)[0]).toMatchObject({ taxed: null })
  })

  it('查询里的计算字段与公式度量都能引用参数', () => {
    const result = runQuery({
      dimensions: [],
      measures: [
        { id: 'amount', aggregate: 'sum', field: 'taxed' },
        { id: 'gap', formula: 'amount - $target' },
      ],
    }, dataset, salesData, { formula: engine, parameters: { rate: 2, target: 500 } })
    expect(result.total).toEqual({ amount: 560, gap: 60 })
    expect(result.total).not.toHaveProperty('$target')
  })
})
