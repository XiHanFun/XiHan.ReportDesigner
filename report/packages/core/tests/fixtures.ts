/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 测试共用的数据集、数据行与按表查找的公式引擎替身。

import type { CompiledFormula, DataRow, DatasetRows, DatasetSchema, FormulaEngine } from '../src'

export const salesDataset: DatasetSchema = {
  id: 'sales',
  title: '销售',
  fields: [
    { name: 'region', type: 'string', title: '区域' },
    { name: 'product', type: 'string', title: '产品' },
    { name: 'date', type: 'date', title: '日期' },
    { name: 'amount', type: 'number', title: '金额' },
    { name: 'qty', type: 'number', title: '数量' },
  ],
  parameters: [
    { name: 'year', type: 'number' },
  ],
}

export const salesRows: readonly DataRow[] = [
  { region: 'East', product: 'A', date: '2026-01-15', amount: 100, qty: 1 },
  { region: 'East', product: 'B', date: '2026-02-03', amount: 50, qty: 2 },
  { region: 'West', product: 'A', date: '2026-01-20', amount: 80, qty: 1 },
  { region: 'West', product: 'B', date: '2026-02-10', amount: null, qty: 3 },
  { region: null, product: 'A', date: '2026-03-01', amount: 20, qty: 1 },
  { region: 'East', product: 'A', date: '2026-03-05', amount: 30, qty: 4 },
]

export const salesData: DatasetRows = { kind: 'rows', rows: salesRows }

/** 按表查找的公式引擎替身：只认表里登记的表达式。 */
export function lookupEngine(table: Readonly<Record<string, CompiledFormula>>): FormulaEngine & { readonly compiled: string[] } {
  const compiled: string[] = []
  return {
    compiled,
    compile(expression) {
      const formula = table[expression]
      if (!formula)
        throw new SyntaxError(expression)
      compiled.push(expression)
      return formula
    },
  }
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN
}

/** 测试里用到的几个表达式。 */
export const formulas: Readonly<Record<string, CompiledFormula>> = {
  'amount / qty': { references: ['amount', 'qty'], evaluate: s => num(s.amount) / num(s.qty) },
  'amount * 2': { references: ['amount'], evaluate: s => (s.amount === null ? null : num(s.amount) * 2) },
  'double + 1': { references: ['double'], evaluate: s => (s.double === null ? null : num(s.double) + 1) },
  'a + 1': { references: ['a'], evaluate: s => num(s.a) + 1 },
  'b + 1': { references: ['b'], evaluate: s => num(s.b) + 1 },
  'boom': { references: [], evaluate: () => { throw new Error('boom') } },
  '$rate * amount': { references: ['$rate', 'amount'], evaluate: s => (s.$rate === undefined || s.amount === null ? null : num(s.$rate) * num(s.amount)) },
  'amount - $target': { references: ['amount', '$target'], evaluate: s => num(s.amount) - num(s.$target) },
}
