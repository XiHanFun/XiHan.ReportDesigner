/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 公式的接入点：表达式求值由使用方注入的 FormulaEngine 完成，这里只负责编译、排序与调用。

import type { DataRow, DatasetSchema } from '../schema'
import { ReportComputeError } from './errors'

/** 编译好的表达式。 */
export interface CompiledFormula {
  /** 表达式引用的变量名。 */
  readonly references: readonly string[]
  /** 以 scope 里的变量求值。 */
  readonly evaluate: (scope: Readonly<Record<string, unknown>>) => unknown
}

/** 表达式引擎：编译表达式字符串；不合法时抛出。 */
export interface FormulaEngine {
  readonly compile: (expression: string) => CompiledFormula
}

/** 一个待求值的公式：结果写到 name。 */
export interface FormulaEntry {
  readonly name: string
  readonly expression: string
}

/** 编译并按依赖排好序的一组公式。 */
export interface FormulaPlan {
  readonly entries: readonly { readonly name: string, readonly formula: CompiledFormula }[]
}

/** 编译一个表达式；没有引擎或编译失败时抛出计算错误。 */
export function compileFormula(engine: FormulaEngine | undefined, expression: string, location: Readonly<Record<string, unknown>>): CompiledFormula {
  if (!engine)
    throw new ReportComputeError('formula-engine-missing', location)
  try {
    return engine.compile(expression)
  }
  catch (error) {
    throw new ReportComputeError('formula-compile-failed', { ...location, expression }, { cause: error })
  }
}

/**
 * 编译一组公式，并按相互引用排序：被引用的先求值。
 * 公式之间循环引用时抛出 formula-cycle，params.names 是环上的名字。
 */
export function planFormulas(engine: FormulaEngine | undefined, entries: readonly FormulaEntry[], kind: string): FormulaPlan {
  const compiled = new Map<string, CompiledFormula>()
  for (const entry of entries)
    compiled.set(entry.name, compileFormula(engine, entry.expression, { [kind]: entry.name }))
  const ordered: { name: string, formula: CompiledFormula }[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []

  function visit(name: string): void {
    const mark = state.get(name)
    if (mark === 'done')
      return
    if (mark === 'visiting')
      throw new ReportComputeError('formula-cycle', { names: stack.slice(stack.indexOf(name)) })
    const formula = compiled.get(name)!
    state.set(name, 'visiting')
    stack.push(name)
    for (const reference of formula.references) {
      if (compiled.has(reference))
        visit(reference)
    }
    stack.pop()
    state.set(name, 'done')
    ordered.push({ name, formula })
  }

  for (const entry of entries)
    visit(entry.name)
  return { entries: ordered }
}

/** 按计划求值，结果逐个写进 scope；求值抛出时包成 formula-evaluation-failed。 */
export function evaluatePlan(plan: FormulaPlan, scope: Record<string, unknown>, location: Readonly<Record<string, unknown>>): void {
  for (const { name, formula } of plan.entries) {
    try {
      scope[name] = formula.evaluate(scope)
    }
    catch (error) {
      throw new ReportComputeError('formula-evaluation-failed', { ...location, name }, { cause: error })
    }
  }
}

/** 数据集里的计算字段。 */
export function calculatedFields(dataset: DatasetSchema): readonly FormulaEntry[] {
  const entries: FormulaEntry[] = []
  for (const field of dataset.fields) {
    if (field.formula !== undefined)
      entries.push({ name: field.name, expression: field.formula })
  }
  return entries
}

/**
 * 给每行算出计算字段，返回新的行数组；数据集没有计算字段时原样返回。
 * 计算字段以同一行的其它字段（含先算出的计算字段）为变量。
 */
export function applyCalculatedFields(rows: readonly DataRow[], dataset: DatasetSchema, engine: FormulaEngine | undefined): readonly DataRow[] {
  const entries = calculatedFields(dataset)
  if (entries.length === 0)
    return rows
  const plan = planFormulas(engine, entries, 'field')
  return rows.map((row, index) => {
    const scope: Record<string, unknown> = { ...row }
    evaluatePlan(plan, scope, { dataset: dataset.id, row: index })
    return scope
  })
}
