/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 公式的接入点：表达式求值由使用方注入的 ExpressionEngine 完成，这里只负责编译、排序与调用。

import type { CompiledExpression, ExpressionEngine } from '../expression'
import type { DataRow, DatasetSchema, ParameterValues } from '../schema'
import { ReportComputeError } from './errors'

/** 一个待求值的公式：结果写到 name。 */
export interface FormulaEntry {
  readonly name: string
  readonly expression: string
}

/** 编译并按依赖排好序的一组公式。 */
export interface FormulaPlan {
  readonly entries: readonly { readonly name: string, readonly formula: CompiledExpression }[]
}

/** 编译一个表达式；没有引擎时抛出 formula-engine-missing，编译不通过时抛出 formula-compile-failed（params.issues 是表达式的问题）。 */
export function compileFormula(engine: ExpressionEngine | undefined, expression: string, location: Readonly<Record<string, unknown>>): CompiledExpression {
  if (!engine)
    throw new ReportComputeError('formula-engine-missing', location)
  const result = engine.compile(expression)
  if (!result.ok)
    throw new ReportComputeError('formula-compile-failed', { ...location, expression, issues: result.issues })
  return result
}

/**
 * 编译一组公式，并按相互引用排序：被引用的先求值。
 * 公式之间循环引用时抛出 formula-cycle，params.names 是环上的名字。
 */
export function planFormulas(engine: ExpressionEngine | undefined, entries: readonly FormulaEntry[], kind: string): FormulaPlan {
  const compiled = new Map<string, CompiledExpression>()
  for (const entry of entries)
    compiled.set(entry.name, compileFormula(engine, entry.expression, { [kind]: entry.name }))
  const ordered: { name: string, formula: CompiledExpression }[] = []
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

/** 报表参数在公式里的变量：参数名前加 $。 */
export function parameterScope(parameters: ParameterValues): Readonly<Record<string, unknown>> {
  const scope: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(parameters))
    scope[`$${name}`] = value
  return scope
}

/**
 * 按计划求值，结果逐个写进 target；target 与 extra 里的变量都可引用，extra 不写进 target。
 * 求值不通过时抛出 formula-evaluation-failed，params.issue 是表达式的问题。
 */
export function evaluatePlan(plan: FormulaPlan, target: Record<string, unknown>, location: Readonly<Record<string, unknown>>, extra?: Readonly<Record<string, unknown>>): void {
  const merge = extra !== undefined && Object.keys(extra).length > 0
  for (const { name, formula } of plan.entries) {
    const result = formula.evaluate(merge ? { ...extra, ...target } : target)
    if (!result.ok)
      throw new ReportComputeError('formula-evaluation-failed', { ...location, name, issue: result.issue })
    target[name] = result.value
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
 * 计算字段以同一行的其它字段（含先算出的计算字段）与报表参数（$名字）为变量。
 */
export function applyCalculatedFields(rows: readonly DataRow[], dataset: DatasetSchema, engine: ExpressionEngine | undefined, parameters: ParameterValues = {}): readonly DataRow[] {
  const entries = calculatedFields(dataset)
  if (entries.length === 0)
    return rows
  const plan = planFormulas(engine, entries, 'field')
  const extra = parameterScope(parameters)
  return rows.map((row, index) => {
    const values: Record<string, unknown> = { ...row }
    evaluatePlan(plan, values, { dataset: dataset.id, row: index }, extra)
    return values
  })
}
